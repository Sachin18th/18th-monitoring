/**
 * RecommendationService — native (SQL/TS) product recommendations over the
 * canonical tables (docs/CDP-IMPLEMENTATION-PLAN.md Phase 2 recs sub-phase).
 *
 * A TypeScript port of the pure-SQL half of ai-agent-ecom's recommendation_queries.py
 * — no ALS / embeddings / Qdrant. Covers:
 *   - forCustomer            — personalized by the customer's favorite categories/vendors
 *   - frequentlyBoughtTogether — co-purchase basket analysis + lift
 *   - trending               — most-purchased in a recent window
 *   - similarProducts        — content overlap (shared category or vendor)
 *
 * Order line items live in canonical_orders.metadata.lineItems[] (product_id), so
 * orders are read and reduced in TS. Fine for typical per-store volumes.
 *
 * `db` is the tenant data-plane Prisma client (getDataPlaneClient); typed `any`.
 */

export interface RecItem {
  productId: string;
  name: string | null;
  price: number | null;
  imageUrl: string | null;
  vendor: string | null;
  category: string | null;
  score: number;
  reason: string;
}

interface ProductInfo {
  productId: string;
  name: string | null;
  price: number | null;
  imageUrl: string | null;
  vendor: string | null;
}

interface LoadedCatalog {
  products: Map<string, ProductInfo>;
  categoriesByProduct: Map<string, string[]>;
  popularity: Map<string, number>; // product_id → units purchased (all-time)
  orders: Array<{ productIds: string[]; customerId: string | null; emailHash: string | null; placedAt: Date | null }>;
}

export class RecommendationService {
  /** Personalized recommendations for one customer; falls back to trending. */
  static async forCustomer(
    db: any,
    scope: { connectorInstanceId: string },
    customerProfileId: string,
    topN = 6,
  ): Promise<RecItem[]> {
    const profile = await db.customerProfile.findUnique({
      where: { id: customerProfileId },
      select: { externalIds: true, emailHash: true },
    });
    if (!profile) return [];

    const cat = await this.loadCatalog(db, scope.connectorInstanceId);
    const shopifyId = profile.externalIds ? Object.values(profile.externalIds).map(String) : [];
    const emailHash = profile.emailHash || null;

    // This customer's purchased products.
    const purchased = new Set<string>();
    for (const o of cat.orders) {
      const mine = (o.customerId && shopifyId.includes(o.customerId)) || (emailHash && o.emailHash === emailHash);
      if (mine) o.productIds.forEach((p) => purchased.add(p));
    }
    if (purchased.size === 0) return this.trendingFrom(cat, topN); // cold start

    // Favorite categories / vendors, weighted by how many owned products hit them.
    const favCats = new Map<string, number>();
    const favVendors = new Map<string, number>();
    for (const pid of purchased) {
      for (const c of cat.categoriesByProduct.get(pid) || []) favCats.set(c, (favCats.get(c) || 0) + 1);
      const v = cat.products.get(pid)?.vendor;
      if (v) favVendors.set(v, (favVendors.get(v) || 0) + 1);
    }

    const maxPop = Math.max(1, ...cat.popularity.values());
    const scored: RecItem[] = [];
    for (const [pid, info] of cat.products) {
      if (purchased.has(pid)) continue; // don't recommend what they own
      let score = 0;
      const reasons: string[] = [];
      const cats = cat.categoriesByProduct.get(pid) || [];
      const catHit = cats.find((c) => favCats.has(c));
      if (catHit) {
        score += 2 * (favCats.get(catHit) || 1);
        reasons.push(`buys ${catHit}`);
      }
      if (info.vendor && favVendors.has(info.vendor)) {
        score += 1 * (favVendors.get(info.vendor) || 1);
        reasons.push(`likes ${info.vendor}`);
      }
      // Blend in normalized popularity so ties resolve toward proven sellers.
      score += ((cat.popularity.get(pid) || 0) / maxPop) * 1.5;
      if (score <= 0) continue;
      scored.push({
        productId: pid,
        name: info.name,
        price: info.price,
        imageUrl: info.imageUrl,
        vendor: info.vendor,
        category: cats[0] || null,
        score: Math.round(score * 100) / 100,
        reason: reasons[0] || 'popular',
      });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topN);
    return top.length ? top : this.trendingFrom(cat, topN);
  }

  /** "Customers who bought X also bought…" via co-occurrence + lift. */
  static async frequentlyBoughtTogether(
    db: any,
    scope: { connectorInstanceId: string },
    productId: string,
    topN = 6,
    minSupport = 1,
  ): Promise<RecItem[]> {
    const cat = await this.loadCatalog(db, scope.connectorInstanceId);
    const totalOrders = cat.orders.length || 1;
    const ordersWithA = cat.orders.filter((o) => o.productIds.includes(productId));
    if (ordersWithA.length === 0) return [];

    const coCount = new Map<string, number>();
    for (const o of ordersWithA) {
      for (const p of new Set(o.productIds)) {
        if (p !== productId) coCount.set(p, (coCount.get(p) || 0) + 1);
      }
    }
    const buyersOf = (p: string) => cat.orders.filter((o) => o.productIds.includes(p)).length;

    const scored: RecItem[] = [];
    for (const [p, co] of coCount) {
      if (co < minSupport) continue;
      const info = cat.products.get(p);
      if (!info) continue;
      // lift = P(B|A) / P(B)
      const confidence = co / ordersWithA.length;
      const pB = buyersOf(p) / totalOrders;
      const lift = pB > 0 ? Math.min(confidence / pB, 10) : 0;
      const score = lift * Math.log1p(co);
      scored.push({
        productId: p,
        name: info.name,
        price: info.price,
        imageUrl: info.imageUrl,
        vendor: info.vendor,
        category: (cat.categoriesByProduct.get(p) || [])[0] || null,
        score: Math.round(score * 100) / 100,
        reason: `bought together (${co}×)`,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN);
  }

  /** Most-purchased products within the recent window. */
  static async trending(
    db: any,
    scope: { connectorInstanceId: string },
    topN = 6,
    windowDays = 90,
    now: Date = new Date(),
  ): Promise<RecItem[]> {
    const cat = await this.loadCatalog(db, scope.connectorInstanceId);
    const cutoff = new Date(now.getTime() - windowDays * 86_400_000);
    const counts = new Map<string, number>();
    for (const o of cat.orders) {
      if (o.placedAt && o.placedAt < cutoff) continue;
      for (const p of o.productIds) counts.set(p, (counts.get(p) || 0) + 1);
    }
    return this.topFromCounts(cat, counts, topN, 'trending');
  }

  /** Products sharing a category or vendor with the given product. */
  static async similarProducts(
    db: any,
    scope: { connectorInstanceId: string },
    productId: string,
    topN = 6,
  ): Promise<RecItem[]> {
    const cat = await this.loadCatalog(db, scope.connectorInstanceId);
    const baseCats = new Set(cat.categoriesByProduct.get(productId) || []);
    const baseVendor = cat.products.get(productId)?.vendor || null;
    const maxPop = Math.max(1, ...cat.popularity.values());

    const scored: RecItem[] = [];
    for (const [pid, info] of cat.products) {
      if (pid === productId) continue;
      let score = 0;
      const reasons: string[] = [];
      const shared = (cat.categoriesByProduct.get(pid) || []).filter((c) => baseCats.has(c));
      if (shared.length) {
        score += 2 * shared.length;
        reasons.push(`same category (${shared[0]})`);
      }
      if (baseVendor && info.vendor === baseVendor) {
        score += 1;
        reasons.push(`same brand`);
      }
      if (score <= 0) continue;
      score += ((cat.popularity.get(pid) || 0) / maxPop) * 0.5;
      scored.push({
        productId: pid,
        name: info.name,
        price: info.price,
        imageUrl: info.imageUrl,
        vendor: info.vendor,
        category: shared[0] || (cat.categoriesByProduct.get(pid) || [])[0] || null,
        score: Math.round(score * 100) / 100,
        reason: reasons[0],
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN);
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  private static trendingFrom(cat: LoadedCatalog, topN: number): RecItem[] {
    return this.topFromCounts(cat, cat.popularity, topN, 'popular');
  }
  private static topFromCounts(cat: LoadedCatalog, counts: Map<string, number>, topN: number, reason: string): RecItem[] {
    return [...counts.entries()]
      .map(([pid, n]) => {
        const info = cat.products.get(pid);
        if (!info) return null;
        return {
          productId: pid,
          name: info.name,
          price: info.price,
          imageUrl: info.imageUrl,
          vendor: info.vendor,
          category: (cat.categoriesByProduct.get(pid) || [])[0] || null,
          score: n,
          reason: `${reason} (${n} sold)`,
        } as RecItem;
      })
      .filter((x): x is RecItem => x != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  /**
   * The products this customer ACTUALLY added to cart in their live sessions,
   * read from storefront `add_to_cart` events and matched back to the catalog
   * for image + price + handle. Newest first, de-duplicated per product. Used by
   * cart-recovery emails so we feature the real abandoned items — not just
   * generic recommendations.
   *
   * The event stores the full storefront title ("Boxie Maxi Dress | Occasionwear
   * | Amaroso") while the catalog stores the short name ("Boxie Maxi Dress"), so
   * matching is by normalized name (everything before the first `|` / ` - `).
   * If a product can't be matched, it's still returned with name + event price
   * and no image (the email then links it to the store front).
   */
  static async liveCartItems(
    db: any,
    scope: { connectorInstanceId: string },
    customerProfileId: string,
    opts: { limit?: number; sinceDays?: number } = {},
  ): Promise<RecItem[]> {
    const limit = opts.limit ?? 5;
    const where: any = { connectorInstanceId: scope.connectorInstanceId, customerProfileId, eventType: 'add_to_cart' };
    if (opts.sinceDays) where.occurredAt = { gte: new Date(Date.now() - opts.sinceDays * 86_400_000) };
    const events: any[] = await db.storefrontEvent.findMany({
      where,
      select: { properties: true, occurredAt: true },
      orderBy: { occurredAt: 'desc' },
    });
    if (!events.length) return [];

    // Name index over the catalog (normalized short name → product incl. handle).
    const productRows: any[] = await db.canonicalProduct.findMany({
      where: { connectorInstanceId: scope.connectorInstanceId },
      select: { productId: true, name: true, price: true, metadata: true },
    });
    const byName = new Map<string, any>();
    for (const p of productRows) {
      const key = normalizeProductName(p.name);
      if (key && !byName.has(key)) byName.set(key, p);
    }

    const out: RecItem[] = [];
    const seen = new Set<string>();
    for (const ev of events) {
      const props = (ev.properties as any) || {};
      const rawName: string | null = props.product_name || props.productName || null;
      if (!rawName) continue;
      const key = normalizeProductName(rawName);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const match = byName.get(key);
      const meta = match ? ((match.metadata as any) || {}) : {};
      out.push({
        productId: match ? String(match.productId) : '',
        name: match?.name || String(rawName).split(/\s*\|/)[0].replace(/\s+[-–—]\s+.*$/, '').trim(),
        price: match?.price != null ? Number(match.price) : parseEventPrice(props.price),
        imageUrl: meta.imageUrl ?? null,
        vendor: meta.vendor ?? null,
        category: null,
        score: 1_000, // always rank ahead of recommendations
        reason: 'You left this in your cart',
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  private static async loadCatalog(db: any, connectorInstanceId: string): Promise<LoadedCatalog> {
    const [productRows, categoryRows, orderRows] = await Promise.all([
      db.canonicalProduct.findMany({
        where: { connectorInstanceId },
        select: { productId: true, name: true, price: true, metadata: true },
      }),
      db.canonicalProductCategory.findMany({
        where: { connectorInstanceId },
        select: { productId: true, categoryName: true },
      }),
      db.canonicalOrder.findMany({
        where: { connectorInstanceId },
        select: { metadata: true, placedAt: true },
      }),
    ]);

    const products = new Map<string, ProductInfo>();
    for (const p of productRows) {
      const meta = (p.metadata as any) || {};
      products.set(String(p.productId), {
        productId: String(p.productId),
        name: p.name ?? null,
        price: p.price != null ? Number(p.price) : null,
        imageUrl: meta.imageUrl ?? null,
        vendor: meta.vendor ?? null,
      });
    }

    const categoriesByProduct = new Map<string, string[]>();
    for (const c of categoryRows) {
      if (!c.categoryName) continue;
      const key = String(c.productId);
      const arr = categoriesByProduct.get(key) || [];
      arr.push(c.categoryName);
      categoriesByProduct.set(key, arr);
    }

    const orders: LoadedCatalog['orders'] = [];
    const popularity = new Map<string, number>();
    for (const o of orderRows) {
      const meta = (o.metadata as any) || {};
      const lineItems = Array.isArray(meta.lineItems) ? meta.lineItems : [];
      const productIds = lineItems
        .map((li: any) => (li?.product_id != null ? String(li.product_id) : null))
        .filter((x: any): x is string => !!x);
      for (const p of productIds) popularity.set(p, (popularity.get(p) || 0) + 1);
      orders.push({
        productIds,
        customerId: meta.customer?.id != null ? String(meta.customer.id) : null,
        emailHash: meta.customerEmailHash || null,
        placedAt: o.placedAt ? new Date(o.placedAt) : null,
      });
    }

    return { products, categoriesByProduct, popularity, orders };
  }
}

/**
 * Normalize a product title for matching an add_to_cart event ("Boxie Maxi Dress
 * | Occasionwear | Amaroso") against a catalog name ("Boxie Maxi Dress"): drop
 * everything after the first pipe, then any " - subtitle" suffix, lowercase and
 * collapse whitespace. Hyphens without surrounding spaces (e.g. "Linen-Blend")
 * are preserved so they don't over-truncate.
 */
function normalizeProductName(name: string | null | undefined): string {
  if (!name) return '';
  return String(name)
    .split('|')[0]
    .replace(/\s+[-–—]\s+.*$/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse an event price string like "5,400.00" into a number. */
function parseEventPrice(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}
