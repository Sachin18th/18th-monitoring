/**
 * RevenuePulseService — a native-TS port of ai-agent-ecom's Revenue Daily-Pulse
 * (repository.calculate_revenue_pulse) computed over 18th-monitoring's
 * canonical_orders + line items + canonical_products/categories.
 *
 * Differences from the original (data-driven, documented in the UI):
 *   - Currency is the store's own (e.g. USD), not INR.
 *   - No shipping column in canonical_orders → shipping is 0.
 *   - No refund date → returns are attributed by order placedAt (not refund date).
 *   - COGS is a catalog-price proxy (no true cost in source), same caveat as origin.
 *   - Windows resolve on UTC (source timestamps are UTC-naive), not IST.
 *
 * `db` is the tenant data-plane Prisma client; typed `any` per convention.
 */

const TARGET_GROWTH = 1.1;
const DAY = 86_400_000;

export interface PulseData {
  timestamp: string;
  currency: string;
  filters: { period: string; brand: string | null; category: string | null };
  window: { start: string; end: string; days_elapsed: number; days_in_month: number; days_remaining: number };
  headline: { net_revenue: number; gross_revenue: number; gross_sales: number; returns: number; discounts: number; shipping: number; taxes: number };
  comparisons: { mom: { net_revenue: number; revenue_growth: number | null }; yoy: { net_revenue: number; revenue_growth: number | null } };
  tiles: {
    orders: number; orders_growth: number | null; aov: number; aov_growth: number | null;
    gross_margin_pct: number; gross_margin_delta_pts: number; discount_rate_pct: number; discount_rate_delta_pts: number;
  };
  pace: { run_rate: number; target: number; elapsed_pct: number; progress_pct: number; pace_pct: number | null; gap_per_day: number | null; on_track: boolean | null; applicable: boolean };
  cost_coverage_pct: number;
  daily_trend: { date: string; day: number; orders: number; net_revenue: number; aov: number; prev_net_revenue: number; cum_net_revenue: number; cum_prev_net_revenue: number }[];
  by_brand: { brand: string; revenue: number; revenue_share_pct: number; est_cogs: number; est_margin: number; est_margin_pct: number; margin_share_pct: number }[];
  by_category: { category: string; revenue: number; revenue_share_pct: number; growth_mom_pct: number | null }[];
}

interface OrderLine { productId: string; qty: number; price: number; vendor: string }
interface Ord {
  placedAt: Date; status: string; total: number; tax: number; discount: number; refunded: number;
  lines: OrderLine[]; brands: Set<string>; categories: Set<string>;
}

export class RevenuePulseService {
  static async compute(
    db: any,
    scope: { connectorInstanceId: string },
    opts: { period?: string; startDate?: string | null; endDate?: string | null; brand?: string | null; category?: string | null; now?: Date } = {},
  ): Promise<PulseData> {
    const period = opts.period || 'mtd';
    const brand = opts.brand || null;
    const category = opts.category || null;
    const now = opts.now || new Date();
    const { connectorInstanceId } = scope;

    const [orderRows, productRows, catRows] = await Promise.all([
      db.canonicalOrder.findMany({ where: { connectorInstanceId }, select: { placedAt: true, normalizedStatus: true, currency: true, totalAmount: true, taxAmount: true, discountAmount: true, refundedAmount: true, metadata: true } }),
      db.canonicalProduct.findMany({ where: { connectorInstanceId }, select: { productId: true, price: true, metadata: true } }),
      db.canonicalProductCategory.findMany({ where: { connectorInstanceId }, select: { productId: true, categoryName: true } }),
    ]);

    const catalogPrice = new Map<string, number>();
    const productVendor = new Map<string, string>();
    for (const p of productRows) {
      catalogPrice.set(String(p.productId), p.price != null ? Number(p.price) : 0);
      const v = (p.metadata as any)?.vendor;
      if (v) productVendor.set(String(p.productId), String(v));
    }
    const catByProduct = new Map<string, string>();
    for (const c of catRows) if (c.categoryName && !catByProduct.has(String(c.productId))) catByProduct.set(String(c.productId), c.categoryName);

    const currency = orderRows.find((o: any) => o.currency)?.currency || 'USD';

    // Normalize orders once.
    const orders: Ord[] = orderRows.map((o: any) => {
      const lineItems = Array.isArray((o.metadata as any)?.lineItems) ? (o.metadata as any).lineItems : [];
      const lines: OrderLine[] = lineItems.map((li: any) => {
        const productId = li?.product_id != null ? String(li.product_id) : '';
        const vendor = String(li?.vendor || productVendor.get(productId) || 'Unassigned');
        return { productId, qty: Number(li?.quantity ?? li?.current_quantity ?? 1) || 1, price: parseFloat(String(li?.price ?? '0')) || 0, vendor };
      });
      const brands = new Set(lines.map((l) => l.vendor));
      const categories = new Set(lines.map((l) => catByProduct.get(l.productId) || 'Unassigned'));
      return {
        placedAt: new Date(o.placedAt),
        status: String(o.normalizedStatus || '').toLowerCase(),
        total: o.totalAmount != null ? Number(o.totalAmount) : 0,
        tax: o.taxAmount != null ? Number(o.taxAmount) : 0,
        discount: o.discountAmount != null ? Number(o.discountAmount) : 0,
        refunded: o.refundedAmount != null ? Number(o.refundedAmount) : 0,
        lines, brands, categories,
      };
    });

    const matches = (o: Ord) => (!brand || o.brands.has(brand)) && (!category || o.categories.has(category));

    const win = resolveWindow(period, opts.startDate, opts.endDate, now);
    const cur = windowMetrics(orders, win.lo, win.hi, catalogPrice, matches);
    const mom = windowMetrics(orders, shiftMonths(win.lo, -1), shiftMonths(win.hi, -1), catalogPrice, matches);
    const yoy = windowMetrics(orders, shiftMonths(win.lo, -12), shiftMonths(win.hi, -12), catalogPrice, matches);

    // Pace to target: prior full month net × growth.
    const pmLo = shiftMonths(startOfMonth(win.lo), -1);
    const pmHi = endOfMonth(pmLo);
    const prevFull = windowMetrics(orders, pmLo, pmHi, catalogPrice, matches);
    const target = prevFull.net_revenue * TARGET_GROWTH;
    const netMtd = cur.net_revenue;
    const runRate = win.daysElapsed ? (netMtd / win.daysElapsed) * win.daysInMonth : 0;
    const elapsedPct = win.daysInMonth ? (win.daysElapsed / win.daysInMonth) * 100 : 0;
    const progressPct = target ? (netMtd / target) * 100 : 0;
    const pace = {
      run_rate: round2(runRate), target: round2(target), elapsed_pct: round1(elapsedPct), progress_pct: round1(progressPct),
      pace_pct: elapsedPct ? round1((progressPct / elapsedPct) * 100) : null,
      gap_per_day: win.daysRemaining > 0 ? round2((target - netMtd) / win.daysRemaining) : null,
      on_track: target ? runRate >= target : null,
      applicable: period === 'mtd',
    };

    // Daily trend: a CONTINUOUS day axis (1..lastDay) with per-day AND cumulative
    // net revenue for the current vs prior month, aligned by day-of-month. The
    // continuous axis + cumulative running total ensures both lines render even
    // for sparse stores (a per-day-only series collapses the prior-month line to
    // 0 at the current month's order days), and matches the wireframe's rising curve.
    const curByDay = new Map<number, { orders: number; net: number; date: string }>(
      dailyTrend(orders, win.lo, win.hi, matches).map((d) => [d.day, { orders: d.orders, net: d.net, date: d.date }]),
    );
    const prevByDay = new Map<number, number>(dailyTrend(orders, shiftMonths(win.lo, -1), shiftMonths(win.hi, -1), matches).map((d) => [d.day, d.net]));
    const observedMax = Math.max(0, ...curByDay.keys(), ...prevByDay.keys());
    const lastDay = period === 'mtd' ? win.daysElapsed : period === 'last_month' ? win.daysInMonth : observedMax || 1;
    const daily_trend: PulseData['daily_trend'] = [];
    let cCum = 0, pCum = 0;
    for (let day = 1; day <= lastDay; day++) {
      const cu = curByDay.get(day);
      const dNet = cu?.net || 0;
      const pNet = prevByDay.get(day) || 0;
      cCum += dNet;
      pCum += pNet;
      daily_trend.push({
        date: cu?.date || '', day, orders: cu?.orders || 0,
        net_revenue: round2(dNet), aov: cu?.orders ? round2(dNet / cu.orders) : 0,
        prev_net_revenue: round2(pNet), cum_net_revenue: round2(cCum), cum_prev_net_revenue: round2(pCum),
      });
    }

    // Brand & category breakdowns.
    const brandGroups = byGroup(orders, win.lo, win.hi, catalogPrice, matches, (l) => l.vendor);
    const totalBrandRev = sum(brandGroups.map((g) => g.revenue)) || 0;
    const totalBrandMargin = sum(brandGroups.map((g) => g.revenue - g.cogs)) || 0;
    const by_brand = brandGroups.map((g) => {
      const margin = g.revenue - g.cogs;
      return {
        brand: g.name, revenue: round2(g.revenue), revenue_share_pct: totalBrandRev ? round1((g.revenue / totalBrandRev) * 100) : 0,
        est_cogs: round2(g.cogs), est_margin: round2(margin), est_margin_pct: g.revenue ? round1((margin / g.revenue) * 100) : 0,
        margin_share_pct: totalBrandMargin ? round1((margin / totalBrandMargin) * 100) : 0,
      };
    });

    const catGroups = byGroup(orders, win.lo, win.hi, catalogPrice, matches, (l) => catByProduct.get(l.productId) || 'Unassigned');
    const catPrevGroups = byGroup(orders, shiftMonths(win.lo, -1), shiftMonths(win.hi, -1), catalogPrice, matches, (l) => catByProduct.get(l.productId) || 'Unassigned');
    const catPrev = new Map<string, number>(catPrevGroups.map((g) => [g.name, g.revenue]));
    const totalCatRev = sum(catGroups.map((g) => g.revenue)) || 0;
    const by_category = catGroups.map((g) => ({
      category: g.name, revenue: round2(g.revenue), revenue_share_pct: totalCatRev ? round1((g.revenue / totalCatRev) * 100) : 0,
      growth_mom_pct: growth(g.revenue, catPrev.get(g.name) || 0),
    }));

    return {
      timestamp: now.toISOString(),
      currency,
      filters: { period, brand, category },
      window: { start: win.lo.toISOString(), end: win.hi.toISOString(), days_elapsed: win.daysElapsed, days_in_month: win.daysInMonth, days_remaining: win.daysRemaining },
      headline: { net_revenue: round2(cur.net_revenue), gross_revenue: round2(cur.gross_revenue), gross_sales: round2(cur.gross_sales), returns: round2(cur.returns), discounts: round2(cur.discounts), shipping: round2(cur.shipping), taxes: round2(cur.tax) },
      comparisons: {
        mom: { net_revenue: round2(mom.net_revenue), revenue_growth: growth(cur.net_revenue, mom.net_revenue) },
        yoy: { net_revenue: round2(yoy.net_revenue), revenue_growth: growth(cur.net_revenue, yoy.net_revenue) },
      },
      tiles: {
        orders: cur.orders, orders_growth: growth(cur.orders, mom.orders),
        aov: round2(cur.aov), aov_growth: growth(cur.aov, mom.aov),
        gross_margin_pct: round1(cur.gross_margin_pct), gross_margin_delta_pts: round1(cur.gross_margin_pct - mom.gross_margin_pct),
        discount_rate_pct: round1(cur.discount_rate_pct), discount_rate_delta_pts: round1(cur.discount_rate_pct - mom.discount_rate_pct),
      },
      pace,
      cost_coverage_pct: round1(cur.cost_coverage_pct),
      daily_trend,
      by_brand,
      by_category,
    };
  }
}

// ── window metrics ────────────────────────────────────────────────────────────
interface Metrics { orders: number; gross_sales: number; discounts: number; tax: number; shipping: number; returns: number; net_revenue: number; gross_revenue: number; aov: number; cogs: number; margin_value: number; gross_margin_pct: number; discount_rate_pct: number; cost_coverage_pct: number }

function inWindow(o: Ord, lo: Date, hi: Date): boolean {
  const t = o.placedAt.getTime();
  return t >= lo.getTime() && t <= hi.getTime();
}

function windowMetrics(orders: Ord[], lo: Date, hi: Date, catalogPrice: Map<string, number>, matches: (o: Ord) => boolean): Metrics {
  const inc = orders.filter((o) => inWindow(o, lo, hi) && matches(o));
  let gross_sales = 0, discounts = 0, tax = 0, returns = 0, net = 0, cogs = 0, revAll = 0, revWithCost = 0;
  for (const o of inc) {
    for (const l of o.lines) {
      gross_sales += l.price * l.qty;
      const cp = catalogPrice.get(l.productId) ?? 0;
      cogs += cp * l.qty;
      revAll += l.price * l.qty;
      if (cp > 0) revWithCost += l.price * l.qty;
    }
    discounts += o.discount;
    tax += o.tax;
    returns += o.refunded;
    net += o.total - o.refunded;
  }
  const orderCount = inc.length;
  const margin = net - cogs;
  return {
    orders: orderCount, gross_sales, discounts, tax, shipping: 0, returns,
    net_revenue: net, gross_revenue: gross_sales, aov: orderCount ? net / orderCount : 0,
    cogs, margin_value: margin,
    gross_margin_pct: net ? (margin / net) * 100 : 0,
    discount_rate_pct: gross_sales ? (discounts / gross_sales) * 100 : 0,
    cost_coverage_pct: revAll ? (revWithCost / revAll) * 100 : 0,
  };
}

function dailyTrend(orders: Ord[], lo: Date, hi: Date, matches: (o: Ord) => boolean) {
  const byDay = new Map<string, { day: number; orders: number; net: number }>();
  for (const o of orders) {
    if (!inWindow(o, lo, hi) || !matches(o)) continue;
    const key = o.placedAt.toISOString().slice(0, 10);
    const dom = o.placedAt.getUTCDate();
    const e = byDay.get(key) || { day: dom, orders: 0, net: 0 };
    e.orders += 1;
    e.net += o.total - o.refunded;
    byDay.set(key, e);
  }
  return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, day: v.day, orders: v.orders, net: v.net }));
}

function byGroup(orders: Ord[], lo: Date, hi: Date, catalogPrice: Map<string, number>, matches: (o: Ord) => boolean, keyFn: (l: OrderLine) => string) {
  const m = new Map<string, { revenue: number; cogs: number }>();
  for (const o of orders) {
    if (!inWindow(o, lo, hi) || !matches(o)) continue;
    for (const l of o.lines) {
      const k = keyFn(l) || 'Unassigned';
      const g = m.get(k) || { revenue: 0, cogs: 0 };
      g.revenue += l.price * l.qty;
      g.cogs += (catalogPrice.get(l.productId) ?? 0) * l.qty;
      m.set(k, g);
    }
  }
  return [...m.entries()].map(([name, g]) => ({ name, ...g })).sort((a, b) => b.revenue - a.revenue);
}

// ── window resolution (UTC) ─────────────────────────────────────────────────────
function resolveWindow(period: string, startDate: string | null | undefined, endDate: string | null | undefined, now: Date) {
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let lo: Date, hi: Date;
  if (period === 'custom' && startDate) {
    lo = new Date(startDate);
    hi = endDate ? new Date(endDate) : now;
    if (endDate && hi.getUTCHours() === 0 && hi.getUTCMinutes() === 0 && hi.getUTCSeconds() === 0) {
      hi = new Date(hi.getTime() + DAY - 1);
    }
  } else if (period === 'today') {
    lo = midnight; hi = now;
  } else if (period === 'yesterday') {
    lo = new Date(midnight.getTime() - DAY); hi = new Date(midnight.getTime() - 1000);
  } else if (period === 'ytd') {
    lo = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)); hi = now;
  } else if (period === 'last_month') {
    const firstThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    hi = new Date(firstThis.getTime() - 1000);
    lo = new Date(Date.UTC(hi.getUTCFullYear(), hi.getUTCMonth(), 1));
  } else {
    lo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); hi = now;
  }
  const daysInMonth = new Date(Date.UTC(lo.getUTCFullYear(), lo.getUTCMonth() + 1, 0)).getUTCDate();
  const daysElapsed = Math.floor((Date.UTC(hi.getUTCFullYear(), hi.getUTCMonth(), hi.getUTCDate()) - Date.UTC(lo.getUTCFullYear(), lo.getUTCMonth(), lo.getUTCDate())) / DAY) + 1;
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);
  return { lo, hi, daysElapsed, daysInMonth, daysRemaining };
}

function shiftMonths(dt: Date, months: number): Date {
  const y = dt.getUTCFullYear() + Math.floor((dt.getUTCMonth() + months) / 12);
  const m = ((dt.getUTCMonth() + months) % 12 + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(dt.getUTCDate(), last), dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds(), dt.getUTCMilliseconds()));
}
function startOfMonth(dt: Date): Date { return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1)); }
function endOfMonth(dt: Date): Date { return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0, 23, 59, 59)); }
function growth(curr: number, base: number): number | null { return base ? round2(((curr - base) / base) * 100) : null; }
function sum(xs: number[]): number { return xs.reduce((s, x) => s + x, 0); }
function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }
