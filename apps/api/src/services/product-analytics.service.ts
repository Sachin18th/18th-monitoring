/**
 * ProductAnalyticsService — powers the Product Analytics dashboard (ported from
 * ai-agent-ecom's GA4-based design, but WITHOUT GA4). The behavioral funnel comes
 * from 18th-monitoring's own storefront tracking:
 *   - storefront_events  → product_view / add_to_cart / checkout / purchase counts
 *   - storefront_sessions → channel attribution + funnel flags
 *   - canonical_orders    → units / revenue (source of truth for money)
 *   - canonical_products  → vendor (brand), price, name→id matching
 *
 * Adaptations (documented in the UI): events carry product_name (not id) so we
 * match names to the catalog; per-product "reached checkout / purchase" is
 * approximated at the session level (product was in a cart whose session reached
 * that stage), since checkout events aren't item-level; channels are our own
 * acquisition attribution; no COGS/margin and no per-product return rate.
 *
 * `db` is the tenant data-plane Prisma client; typed `any` per convention.
 */

const DAY = 86_400_000;

export interface ProductAnalytics {
  currency: string;
  window: { start: string; end: string };
  filters: { period: string; brand: string | null; category: string | null };
  hero: {
    cvr: number; cvr_delta_pts: number;
    pageviews: number; pageviews_growth: number | null;
    units: number; units_growth: number | null;
    revenue: number; revenue_growth: number | null;
  };
  channels: {
    key: string; label: string;
    steps: { pageviews: number; atc: number; checkout: number; purchase: number };
    rates: { atc: number; checkout: number; cvr: number };
    products: { name: string; brand: string; sku: string | null; pv: number; atc: number; co: number; cvr: number }[];
  }[];
  brands: { brand: string; pageviews: number; traffic_pct: number; revenue: number; revenue_share_pct: number; cvr: number; units: number; aov: number; skus: number }[];
  underrated: { name: string; brand: string; cvr: number; pageviews: number; opportunity: number; pct_below_avg: number }[];
  catalog_avg: { pageviews: number; cvr: number };
  categories: string[];
}

export class ProductAnalyticsService {
  static async compute(
    db: any,
    scope: { connectorInstanceId: string },
    opts: { period?: string; startDate?: string | null; endDate?: string | null; brand?: string | null; category?: string | null; now?: Date } = {},
  ): Promise<ProductAnalytics> {
    const period = opts.period || 'last_30d';
    const brand = opts.brand || null;
    const category = opts.category || null;
    const now = opts.now || new Date();
    const { connectorInstanceId } = scope;

    const { lo, hi, prevLo, prevHi } = resolveWindow(period, opts.startDate, opts.endDate, now);

    const [products, catRows, events, sessions, orders] = await Promise.all([
      db.canonicalProduct.findMany({ where: { connectorInstanceId }, select: { productId: true, name: true, price: true, metadata: true } }),
      db.canonicalProductCategory.findMany({ where: { connectorInstanceId }, select: { productId: true, categoryName: true } }),
      db.storefrontEvent.findMany({ where: { connectorInstanceId, occurredAt: { gte: prevLo, lte: hi }, eventType: { in: ['product_view', 'add_to_cart'] } }, select: { eventType: true, properties: true, sessionId: true, occurredAt: true } }),
      db.storefrontSession.findMany({ where: { connectorInstanceId, startedAt: { gte: prevLo, lte: hi } }, select: { sessionId: true, channel: true, checkoutStarted: true, purchaseCompleted: true, startedAt: true } }),
      db.canonicalOrder.findMany({ where: { connectorInstanceId, placedAt: { gte: prevLo, lte: hi } }, select: { placedAt: true, currency: true, metadata: true } }),
    ]);

    // Catalog: normalized name → product; product → vendor/name/sku; vendor → sku count.
    const byName = new Map<string, any>();
    const prodById = new Map<string, { name: string; vendor: string; sku: string | null }>();
    const skuByVendor = new Map<string, number>();
    const catByProduct = new Map<string, string>();
    for (const c of catRows) if (c.categoryName && !catByProduct.has(String(c.productId))) catByProduct.set(String(c.productId), c.categoryName);
    for (const p of products) {
      const pid = String(p.productId);
      const vendor = String((p.metadata as any)?.vendor || 'Unassigned');
      const key = normalizeName(p.name);
      if (key && !byName.has(key)) byName.set(key, { productId: pid, name: p.name, vendor });
      prodById.set(pid, { name: p.name || pid, vendor, sku: ((p.metadata as any)?.handle as string) || null });
      skuByVendor.set(vendor, (skuByVendor.get(vendor) || 0) + 1);
    }
    const inBrand = (pid: string) => !brand || prodById.get(pid)?.vendor === brand;
    const inCategory = (pid: string) => !category || catByProduct.get(pid) === category;
    const resolvePid = (rawName: string | null | undefined): string | null => {
      if (!rawName) return null;
      const m = byName.get(normalizeName(rawName));
      return m ? m.productId : null;
    };

    const currency = orders.find((o: any) => o.currency)?.currency || 'USD';
    const sessById = new Map<string, any>(sessions.map((s: any) => [s.sessionId, s]));

    const agg = (a: Date, b: Date) => aggregate(events, sessById, orders, resolvePid, inBrand, inCategory, prodById, a, b);
    const cur = agg(lo, hi);
    const prev = agg(prevLo, prevHi);
    // Order-based purchases per product (real, complete). Product/brand CVR =
    // purchases ÷ tracked views, clamped to 100% (tracked views can lag orders
    // while pixel coverage ramps — surfaced as a note in the UI).
    const purchOf = (pid: string) => cur.productAll.get(pid)?.orders || 0;

    // ── Hero ──────────────────────────────────────────────────────────────────
    // Store conversion = purchasing sessions ÷ sessions (robust, source-consistent).
    const cvr = cur.totalSessions ? (cur.purchaseSessions / cur.totalSessions) * 100 : 0;
    const prevCvr = prev.totalSessions ? (prev.purchaseSessions / prev.totalSessions) * 100 : 0;
    const hero = {
      cvr: round1(cvr), cvr_delta_pts: round1(cvr - prevCvr),
      pageviews: cur.pageviews, pageviews_growth: growth(cur.pageviews, prev.pageviews),
      units: cur.units, units_growth: growth(cur.units, prev.units),
      revenue: round2(cur.revenue), revenue_growth: growth(cur.revenue, prev.revenue),
    };

    // ── Channels + per-product funnel ───────────────────────────────────────────
    const channelKeys = [...new Set([...cur.channels.keys()])].sort();
    const channels: ProductAnalytics['channels'] = [];
    const buildChannel = (key: string, label: string, ch: any) => {
      const steps = { pageviews: ch.pageviews, atc: ch.atc, checkout: ch.checkoutSessions, purchase: ch.purchaseSessions };
      const rates = { atc: pct(steps.atc, steps.pageviews), checkout: pct(steps.checkout, steps.pageviews), cvr: pct(steps.purchase, steps.pageviews) };
      const productList = [...ch.products.entries()].map(([pid, pr]: any) => {
        const info = prodById.get(pid);
        return {
          name: info?.name || pid, brand: info?.vendor || 'Unassigned', sku: info?.sku || null,
          pv: pr.pv, atc: pct(pr.atc, pr.pv), co: pct(pr.co, pr.pv), cvr: Math.min(100, pct(purchOf(pid), pr.pv)),
        };
      }).sort((a, b) => b.pv - a.pv);
      channels.push({ key, label, steps, rates, products: productList });
    };
    // "All channels" first, then each attribution channel.
    buildChannel('all', 'All channels', cur.all);
    for (const k of channelKeys) buildChannel(k, channelLabel(k), cur.channels.get(k));

    // ── Brand performance ───────────────────────────────────────────────────────
    const totalPv = cur.all.pageviews || 0;
    const totalRev = [...cur.brandStats.values()].reduce((s: number, b: any) => s + b.revenue, 0) || 0;
    const brands = [...cur.brandStats.entries()].map(([vendor, b]: any) => ({
      brand: vendor,
      pageviews: b.pageviews,
      traffic_pct: totalPv ? round1((b.pageviews / totalPv) * 100) : 0,
      revenue: round2(b.revenue),
      revenue_share_pct: totalRev ? round1((b.revenue / totalRev) * 100) : 0,
      cvr: Math.min(100, pct(b.orders || 0, b.pageviews)),
      units: b.units,
      aov: b.orders ? round2(b.revenue / b.orders) : 0,
      skus: skuByVendor.get(vendor) || 0,
    })).sort((a, b) => b.revenue - a.revenue);

    // ── Underrated products (high CVR, below-average pageviews) ─────────────────
    // Purchases are order-based (real, complete, product_id); views are tracked.
    // CVR is clamped to 100% and a minimum view sample is required so sparse-data
    // flukes (e.g. 1 view / 6 orders) can't rank. Opportunity uses catalog AOV.
    const MIN_VIEWS = 3;
    const withViews = [...cur.all.products.entries()].filter(([, pr]: any) => pr.pv >= MIN_VIEWS);
    const avgPv = withViews.length ? withViews.reduce((s, [, pr]: any) => s + pr.pv, 0) / withViews.length : 0;
    const totalPurch = withViews.reduce((s, [pid]: any) => s + purchOf(pid), 0);
    const totalViews = withViews.reduce((s, [, pr]: any) => s + pr.pv, 0);
    const avgCvr = totalViews ? Math.min(100, (totalPurch / totalViews) * 100) : 0;
    const overallAov = cur.orderCount ? cur.revenue / cur.orderCount : 0;
    const underrated = withViews
      .map(([pid, pr]: any) => {
        const pcvr = Math.min(100, pr.pv ? (purchOf(pid) / pr.pv) * 100 : 0);
        const info = prodById.get(pid);
        const opportunity = Math.max(0, avgPv - pr.pv) * (pcvr / 100) * (overallAov || 0);
        return { name: info?.name || pid, brand: info?.vendor || 'Unassigned', cvr: round1(pcvr), pageviews: pr.pv, opportunity: round2(opportunity), pct_below_avg: avgPv ? Math.round((1 - pr.pv / avgPv) * 100) : 0, _cvr: pcvr };
      })
      .filter((x) => x._cvr >= avgCvr && x._cvr > 0 && x.pageviews < avgPv)
      .sort((a, b) => b.opportunity - a.opportunity)
      .map(({ _cvr, ...rest }) => rest);

    return {
      currency,
      window: { start: lo.toISOString(), end: hi.toISOString() },
      filters: { period, brand, category },
      hero,
      channels,
      brands,
      underrated,
      catalog_avg: { pageviews: Math.round(avgPv), cvr: round1(avgCvr) },
      categories: [...new Set([...catByProduct.values()])].filter(Boolean).sort(),
    };
  }
}

// ── aggregation over one window ─────────────────────────────────────────────────
function aggregate(events: any[], sessById: Map<string, any>, orders: any[], resolvePid: (n: any) => string | null, inBrand: (p: string) => boolean, inCategory: (p: string) => boolean, prodById: Map<string, any>, lo: Date, hi: Date) {
  const inWin = (d: any) => { const t = new Date(d).getTime(); return t >= lo.getTime() && t <= hi.getTime(); };

  // Per-session cart (products added) + flags + channel, for checkout/purchase attribution.
  const sessionCart = new Map<string, Set<string>>();
  // channel bucket structure
  const mkCh = () => ({ pageviews: 0, atc: 0, checkoutSessions: 0, purchaseSessions: 0, products: new Map<string, any>(), sessions: new Set<string>() });
  const channels = new Map<string, any>();
  const all = mkCh();
  const productAll = new Map<string, any>(); // pid → {pv, atc, orders, units, revenue}

  const chanOf = (sid: string) => normalizeChannel(sessById.get(sid)?.channel);
  const prod = (pid: string, map: Map<string, any>) => { let x = map.get(pid); if (!x) { x = { pv: 0, atc: 0, co: 0, purch: 0, orders: 0, units: 0, revenue: 0 }; map.set(pid, x); } return x; };

  for (const e of events) {
    if (!inWin(e.occurredAt)) continue;
    const pid = resolvePid((e.properties as any)?.product_name || (e.properties as any)?.productName);
    if (!pid || !inBrand(pid) || !inCategory(pid)) continue;
    const ch = chanOf(e.sessionId);
    if (!channels.has(ch)) channels.set(ch, mkCh());
    const cbox = channels.get(ch);
    if (e.eventType === 'product_view') {
      all.pageviews++; cbox.pageviews++;
      prod(pid, all.products).pv++; prod(pid, cbox.products).pv++; prod(pid, productAll).pv++;
    } else if (e.eventType === 'add_to_cart') {
      all.atc++; cbox.atc++;
      prod(pid, all.products).atc++; prod(pid, cbox.products).atc++;
      if (e.sessionId) { let c = sessionCart.get(e.sessionId); if (!c) { c = new Set(); sessionCart.set(e.sessionId, c); } c.add(pid); }
    }
  }

  // Session-level checkout/purchase, attributed to channel + to each product in that session's cart.
  for (const [sid, sess] of sessById) {
    if (!inWin(sess.startedAt)) continue;
    const ch = normalizeChannel(sess.channel);
    if (!channels.has(ch)) channels.set(ch, mkCh());
    const cbox = channels.get(ch);
    const cart = sessionCart.get(sid) || new Set<string>();
    if (sess.checkoutStarted) { all.checkoutSessions++; cbox.checkoutSessions++; for (const pid of cart) { prod(pid, all.products).co++; prod(pid, cbox.products).co++; } }
    if (sess.purchaseCompleted) { all.purchaseSessions++; cbox.purchaseSessions++; for (const pid of cart) { prod(pid, all.products).purch++; prod(pid, cbox.products).purch++; } }
  }

  // Orders → units/revenue/purchase-count per product + per brand (source of truth for money).
  const brandStats = new Map<string, any>();
  let units = 0, revenue = 0, orderCount = 0;
  for (const o of orders) {
    if (!inWin(o.placedAt)) continue;
    const lines = Array.isArray((o.metadata as any)?.lineItems) ? (o.metadata as any).lineItems : [];
    let counted = false;
    const brandsInOrder = new Set<string>();
    for (const li of lines) {
      const pid = li?.product_id != null ? String(li.product_id) : null;
      if (!pid || !inBrand(pid) || !inCategory(pid)) continue;
      const qty = Number(li?.quantity ?? 1) || 1;
      const price = parseFloat(String(li?.price ?? '0')) || 0;
      const line = price * qty;
      units += qty; revenue += line; counted = true;
      const pa = prod(pid, productAll); pa.units += qty; pa.revenue += line; pa.orders += 1;
      const vendor = prodById.get(pid)?.vendor || String(li?.vendor || 'Unassigned');
      let bs = brandStats.get(vendor); if (!bs) { bs = { pageviews: 0, revenue: 0, units: 0, orders: 0 }; brandStats.set(vendor, bs); }
      bs.revenue += line; bs.units += qty; brandsInOrder.add(vendor);
    }
    if (counted) orderCount += 1;
    for (const v of brandsInOrder) brandStats.get(v).orders += 1;
  }
  // brand pageviews from productAll views
  for (const [pid, pr] of productAll) {
    const vendor = prodById.get(pid)?.vendor || 'Unassigned';
    let bs = brandStats.get(vendor); if (!bs) { bs = { pageviews: 0, revenue: 0, units: 0, orders: 0, purchSessions: 0 }; brandStats.set(vendor, bs); }
    bs.pageviews += pr.pv;
  }
  // Brand-level purchases attributed session-based (a purchasing session touches
  // ≥1 product of the brand) so brand CVR is tracked-views-consistent (≤100%).
  for (const [sid, sess] of sessById) {
    if (!inWin(sess.startedAt) || !sess.purchaseCompleted) continue;
    const cart = sessionCart.get(sid);
    if (!cart || !cart.size) continue;
    const vendors = new Set<string>();
    for (const pid of cart) { if (!inBrand(pid) || !inCategory(pid)) continue; vendors.add(prodById.get(pid)?.vendor || 'Unassigned'); }
    for (const v of vendors) { let bs = brandStats.get(v); if (!bs) { bs = { pageviews: 0, revenue: 0, units: 0, orders: 0, purchSessions: 0 }; brandStats.set(v, bs); } bs.purchSessions = (bs.purchSessions || 0) + 1; }
  }

  let totalSessions = 0;
  for (const [, sess] of sessById) if (inWin(sess.startedAt)) totalSessions++;

  return {
    pageviews: all.pageviews, purchaseSessions: all.purchaseSessions, totalSessions, units, revenue, orderCount,
    all, channels, productAll, brandStats,
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────────
function resolveWindow(period: string, startDate: string | null | undefined, endDate: string | null | undefined, now: Date) {
  let lo: Date, hi: Date;
  if (period === 'custom' && startDate) {
    lo = new Date(startDate); hi = endDate ? new Date(endDate) : now;
    if (endDate && hi.getUTCHours() === 0 && hi.getUTCMinutes() === 0) hi = new Date(hi.getTime() + DAY - 1);
  } else if (period === 'mtd') {
    lo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); hi = now;
  } else {
    hi = now; lo = new Date(now.getTime() - 30 * DAY);
  }
  const len = hi.getTime() - lo.getTime();
  return { lo, hi, prevHi: new Date(lo.getTime() - 1), prevLo: new Date(lo.getTime() - len) };
}

function normalizeChannel(ch: string | null | undefined): string {
  const s = String(ch || 'direct').toLowerCase();
  if (s.includes('paid') && s.includes('soc')) return 'paid_social';
  if (s.includes('paid') || s === 'cpc' || s === 'ppc') return 'paid';
  if (s.includes('social')) return 'social';
  if (s.includes('organic') || s === 'seo') return 'organic';
  if (s.includes('email')) return 'email';
  if (s.includes('referral')) return 'referral';
  if (s === 'direct') return 'direct';
  return 'other';
}
function channelLabel(k: string): string {
  const map: Record<string, string> = { direct: 'Direct', organic: 'Organic / SEO', paid: 'Paid', paid_social: 'Paid Social', social: 'Social', email: 'Email', referral: 'Referral', other: 'Other' };
  return map[k] || k;
}
function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return String(name).split('|')[0].replace(/\s+[-–—]\s+.*$/, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function pct(n: number, d: number): number { return d ? Math.round((n / d) * 1000) / 10 : 0; }
function growth(curr: number, base: number): number | null { return base ? round1(((curr - base) / base) * 100) : null; }
function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }
