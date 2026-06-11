/**
 * Canonical storefront event classifier.
 *
 * Each commerce platform names the same shopper action differently (Shopify's
 * `checkout_complete` vs BigCommerce's `orderConfirmation` vs Adobe's
 * `/checkout/onepage/success`). This module collapses those platform-specific
 * signals — raw event_type, page URL, page title and the properties bag — into a
 * single canonical funnel stage so the Purchase Journey Funnel can be computed
 * uniformly.
 *
 * The platform MUST come from connector_instances.provider_id (resolved upstream
 * into a Platform); properties.platform is only a hint and is not trusted here.
 *
 * Rule of thumb: classification is by priority, highest stage first. A page that
 * matches both "product" and "checkout" signals is the later stage — purchase >
 * checkout > add_to_cart > product_view > visit.
 */

export type CanonicalFunnelStage =
  | 'visit'
  | 'product_view'
  | 'add_to_cart'
  | 'checkout'
  | 'purchase';

export type Platform = 'shopify' | 'bigcommerce' | 'adobe_commerce' | 'unknown';

export interface ClassifiedEvent {
  /** The normalized funnel stage this event represents. */
  canonicalStage: CanonicalFunnelStage;
  /** true when the event is a plain page view — collapse into the session, no new row. */
  isPageView: boolean;
  /** false for plain visits/page_views; true for milestone events (product_view → purchase). */
  shouldInsertRow: boolean;
}

/** Funnel ordering. `funnel_stage` always holds the highest rank reached. */
export const STAGE_RANK: Record<CanonicalFunnelStage, number> = {
  visit: 1,
  product_view: 2,
  add_to_cart: 3,
  checkout: 4,
  purchase: 5,
};

/** Stages that warrant their own storefront_events row (everything but `visit`). */
export const MILESTONE_STAGES: ReadonlySet<CanonicalFunnelStage> = new Set([
  'product_view',
  'add_to_cart',
  'checkout',
  'purchase',
]);

interface NormalizedSignals {
  /** Raw event_type, untouched (case-sensitive matches like `addToCart` rely on this). */
  eventType: string;
  /** Lower-cased page URL — all URL substring/regex tests run against this. */
  url: string;
  /** Lower-cased properties.event hint (e.g. 'add_to_cart', 'purchase'). */
  ev: string;
  /** Lower-cased properties.page_type hint (e.g. 'product', 'checkout', 'confirmation'). */
  pageType: string;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

function normalize(params: {
  eventType: string;
  pageUrl: string;
  properties: Record<string, any>;
}): NormalizedSignals {
  const props = params.properties || {};
  return {
    eventType: str(params.eventType).trim(),
    url: str(params.pageUrl).toLowerCase(),
    ev: str(props.event).trim().toLowerCase(),
    pageType: str(props.page_type ?? props.pageType).trim().toLowerCase(),
  };
}

// ── Per-platform classifiers (return null when no commerce signal matches) ────

function classifyShopify(s: NormalizedSignals): CanonicalFunnelStage | null {
  // purchase — order/thank-you page or an explicit completion signal
  if (
    s.eventType === 'checkout_complete' ||
    s.ev === 'purchase' ||
    s.url.includes('/thank_you') ||
    /\/orders\//.test(s.url) ||
    s.pageType === 'confirmation'
  ) {
    return 'purchase';
  }
  // checkout — Shopify checkout lives under /checkouts/
  if (
    s.url.includes('/checkouts/') ||
    s.eventType === 'checkout' ||
    s.eventType === 'checkout_step' ||
    s.eventType === 'checkout_abandon' ||
    s.pageType === 'checkout'
  ) {
    return 'checkout';
  }
  // add_to_cart
  if (s.eventType === 'add_to_cart' || s.ev === 'add_to_cart' || /\/cart\/add/.test(s.url)) {
    return 'add_to_cart';
  }
  // product_view — /products/:slug
  if (s.pageType === 'product' || /\/products\/[^/?]+/.test(s.url) || s.eventType === 'product_view') {
    return 'product_view';
  }
  return null;
}

function classifyBigCommerce(s: NormalizedSignals): CanonicalFunnelStage | null {
  // purchase — order confirmation page
  if (
    s.url.includes('/order-confirmation') ||
    s.eventType === 'orderConfirmation' ||
    s.eventType === 'checkout_complete' ||
    s.pageType === 'orderconfirmation' ||
    s.pageType === 'confirmation'
  ) {
    return 'purchase';
  }
  // checkout — /checkout.php (legacy) or /checkout (optimized one-page)
  if (
    s.url.includes('/checkout.php') ||
    s.url.includes('/checkout') ||
    s.eventType === 'checkout' ||
    s.eventType === 'checkout_step' ||
    s.eventType === 'checkout_abandon' ||
    s.pageType === 'checkout'
  ) {
    return 'checkout';
  }
  // add_to_cart
  if (
    s.eventType === 'addToCart' ||
    s.eventType === 'add_to_cart' ||
    s.ev === 'add_to_cart' ||
    s.url.includes('/cart.php')
  ) {
    return 'add_to_cart';
  }
  // product_view — BigCommerce product URLs have no reliable path prefix, so we
  // trust the page_type / event_type signals rather than a loose URL pattern
  // (which would misclassify category and content pages as products).
  if (s.pageType === 'product' || s.eventType === 'product_view') {
    return 'product_view';
  }
  return null;
}

function classifyAdobeCommerce(s: NormalizedSignals): CanonicalFunnelStage | null {
  // purchase — Magento/Adobe success + order view routes
  if (
    s.url.includes('/checkout/onepage/success') ||
    s.url.includes('/checkout/success') ||
    s.url.includes('/sales/order/view') ||
    s.pageType === 'checkout_success' ||
    s.pageType === 'confirmation' ||
    s.eventType === 'checkout_complete'
  ) {
    return 'purchase';
  }
  // add_to_cart — checked before checkout because /checkout/cart/add lives under
  // /checkout/ and would otherwise be swallowed by the checkout rule below.
  if (
    s.eventType === 'add_to_cart' ||
    s.ev === 'add_to_cart' ||
    s.url.includes('/checkout/cart/add')
  ) {
    return 'add_to_cart';
  }
  // checkout — anything under /checkout/ that is not success or the cart/add action
  if (
    (s.url.includes('/checkout/') && !s.url.includes('/success') && !s.url.includes('/cart/add')) ||
    s.url.includes('/checkout/onepage') ||
    s.eventType === 'checkout' ||
    s.eventType === 'checkout_step' ||
    s.eventType === 'checkout_abandon' ||
    s.pageType === 'checkout'
  ) {
    return 'checkout';
  }
  // product_view — Adobe product pages render at /catalog/product/view
  if (s.url.includes('/catalog/product/view') || s.pageType === 'product' || s.eventType === 'product_view') {
    return 'product_view';
  }
  return null;
}

/**
 * Primary canonical-stage mapping, driven by the raw event_type and the
 * tracker-resolved page_type. The storefront tracker already resolves page_type
 * via platform-native signals (Shopify analytics object, Magento body class)
 * before falling back to DOM/URL, so this mapping is platform-agnostic and the
 * authoritative path. classifyEvent() only falls back to URL/platform heuristics
 * when page_type is absent.
 *
 * Pure function — no I/O, easy to unit test.
 */
export function getCanonicalStage(eventType: string, pageType?: string): CanonicalFunnelStage {
  const et = String(eventType || '').trim();
  const pt = String(pageType || '').trim().toLowerCase();

  if (et === 'checkout_complete') return 'purchase';
  if (et === 'checkout_step') return 'checkout';
  if (et === 'checkout_abandon') return 'checkout'; // was in checkout
  if (et === 'add_to_cart') return 'add_to_cart';   // dedicated add-to-cart click/submit
  if (et === 'product_view') return 'product_view';
  if (et === 'page_view') {
    if (pt === 'confirmation') return 'purchase';
    if (pt === 'checkout') return 'checkout';
    if (pt === 'product') return 'product_view';
    if (pt === 'cart') return 'add_to_cart'; // cart page = intent signal
    return 'visit'; // home, category, other
  }
  return 'visit'; // element_click, custom events — don't affect funnel stage
}

const MILESTONE_PAGE_TYPES: ReadonlySet<string> = new Set(['product', 'checkout', 'confirmation']);

/**
 * Deduplication rule: which events get their own storefront_events row.
 *
 * A `page_view` on a milestone page (product / checkout / confirmation) is
 * SKIPPED because the dedicated event (product_view / checkout_step /
 * checkout_complete) already represents that funnel stage — inserting both
 * double-counts. Pure navigations (home / category / other / cart), the
 * dedicated milestone events, element_clicks and custom events all insert.
 */
export function shouldInsertEvent(eventType: string, pageType?: string): boolean {
  const et = String(eventType || '').trim();
  if (et === 'page_view') {
    return !MILESTONE_PAGE_TYPES.has(String(pageType || '').trim().toLowerCase());
  }
  return true; // product_view / checkout_* / element_click / custom
}

/**
 * Classify a raw storefront event.
 *
 * canonicalStage is resolved primarily from event_type + properties.page_type
 * (getCanonicalStage). When page_type is missing/unknown and that yields 'visit',
 * we fall back to URL/platform heuristics so payloads without a page_type hint
 * still classify (e.g. custom platforms). shouldInsertRow follows the dedup rule.
 */
export function classifyEvent(params: {
  eventType: string;
  pageUrl: string;
  pageTitle: string;
  properties: Record<string, any>;
  platform: Platform;
}): ClassifiedEvent {
  const pageType = String(params.properties?.page_type ?? params.properties?.pageType ?? '').trim();

  let canonicalStage = getCanonicalStage(params.eventType, pageType);

  // Fallback: only when page_type gave us nothing (a plain 'visit' with no
  // page_type hint). Use the URL/platform heuristics to refine the stage.
  if (canonicalStage === 'visit' && !pageType) {
    const signals = normalize(params);
    let stage: CanonicalFunnelStage | null;
    switch (params.platform) {
      case 'shopify':
        stage = classifyShopify(signals);
        break;
      case 'bigcommerce':
        stage = classifyBigCommerce(signals);
        break;
      case 'adobe_commerce':
        stage = classifyAdobeCommerce(signals);
        break;
      default:
        stage =
          classifyShopify(signals) ??
          classifyBigCommerce(signals) ??
          classifyAdobeCommerce(signals);
    }
    if (stage) canonicalStage = stage;
  }

  return {
    canonicalStage,
    isPageView: String(params.eventType || '').trim() === 'page_view',
    shouldInsertRow: shouldInsertEvent(params.eventType, pageType),
  };
}
