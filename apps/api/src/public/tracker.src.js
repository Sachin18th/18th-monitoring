/*!
 * 18th Digitech — Universal storefront tracker (Phase 2).
 * Zero dependencies. Self-contained IIFE. Silent-fail. Never blocks render.
 *
 *   <script src="https://<platform>/api/track/tracker.js"
 *           data-connector-id="conn_xxx"
 *           data-ingest-url="https://<platform>/api/track"></script>
 *
 * Config may alternatively be set via
 *   window.__PLAT_CONFIG__ = { connectorId, ingestUrl }.
 * 
 *
 * Emits the purchase-journey events only — keeps storefront_events lean:
 *   page_view        (a "Visit")
 *   product_view     (PDP view — URL pattern + DOM signals)
 *   add_to_cart      (add-to-cart click / form submit — AJAX-safe, no nav needed)
 *   checkout_step    (entered checkout, OR clicked a "begin checkout" control)
 *   checkout_abandon (left checkout without completing)
 *   checkout_complete(a "Purchase" — order confirmation)
 *   element_click    ONLY for elements tagged data-track="…" (opt-in; we do NOT
 *                    log every anchor/button click — that would bloat the DB)
 *   + window.track(type, props) for any custom event you want.
 *
 * No cookies, no PII, no input values are ever read.
 */
(function () {
  'use strict';
  try {
    // ── Config ───────────────────────────────────────────────────────────────
    // Resolution order: data-* attributes (manual paste / BigCommerce / Adobe)
    // → script src query string (Shopify ScriptTag can't carry data-*: it is
    //   installed as tracker.js?cid=...&ingest=...) → window.__PLAT_CONFIG__.
    // When no ingest is given, derive it from the script's own origin.
    var script = document.currentScript;
    // Fallback for dynamic injection (Google Tag Manager / any tag manager) or
    // any context where currentScript is null: locate our own tag by its src.
    // Prefer the last match (most-recently injected wins). This keeps config
    // readable from data-* attributes and the src query string without needing
    // an inline <script> — which a strict CSP (nonce present) blocks.
    if (!script) {
      try {
        var cand = document.querySelectorAll('script[src*="/api/track/tracker.js"]');
        if (cand && cand.length) script = cand[cand.length - 1];
      } catch (e) {}
    }
    var ds = (script && script.dataset) || {};
    var cfg = window.__PLAT_CONFIG__ || {};
    var srcUrl = (script && script.src) || '';
    var qp = {};
    try {
      var su = new URL(srcUrl, location.href);
      su.searchParams.forEach(function (v, k) { qp[k] = v; });
      srcUrl = su.href;
    } catch (e) {}
    function deriveIngest() {
      try { return new URL(srcUrl, location.href).origin + '/api/track'; } catch (e) { return ''; }
    }
    var CONNECTOR = ds.connectorId || qp.cid || qp.connector_id || cfg.connectorId || '';
    var INGEST = ds.ingestUrl || qp.ingest || qp.ingest_url || cfg.ingestUrl || deriveIngest();
    if (!CONNECTOR || !INGEST) return; // not configured — do nothing

    // RUM error/issue ingest. Errors go to /api/rum/errors (NOT /api/track),
    // carrying connectorId in the query string; the server derives the project
    // from the connector. Resolution order mirrors INGEST: explicit rum-ingest
    // attribute → query string → config → same-origin /api/rum/errors derived
    // from the tracker's own origin (works whether INGEST is /api/track or full).
    function deriveRum() {
      try {
        var base = ds.rumIngestUrl || qp.rum || qp.rum_url || cfg.rumIngestUrl;
        if (!base) {
          var origin = new URL((INGEST.indexOf('http') === 0 ? INGEST : srcUrl), location.href).origin;
          base = origin + '/api/rum/errors';
        }
        return base + (base.indexOf('?') < 0 ? '?' : '&') + 'connectorId=' + encodeURIComponent(CONNECTOR);
      } catch (e) { return ''; }
    }
    var RUM_INGEST = deriveRum();   // full errors endpoint incl. ?connectorId=
    var RUM_PATH = '/api/rum/';     // substring used to skip our own RUM calls

    // ── Constants ──────────────────────────────────────────────────────────
    var VID_KEY = '__plat_vid';   // localStorage  — persists across sessions
    var SID_KEY = '__plat_sid';   // sessionStorage — rotating session id
    var SLA_KEY = '__plat_sla';   // sessionStorage — session last-active epoch ms
    var SESSION_TTL = 30 * 60 * 1000; // 30 min inactivity → new session
    var FLUSH_MS = 5000;          // flush cadence
    var MAX_BATCH = 10;           // flush threshold
    var MAX_RETRY = 2;            // retries after the first send
    var RETRY_MS = 2000;          // delay between retries
    var PV_DEDUPE_MS = 1000;      // no duplicate page_view for same URL within 1s
    var SENSITIVE = /(token|auth|email|password|secret|key|sig|otp)/i;

    // ── Tiny helpers ─────────────────────────────────────────────────────────
    function nowMs() { try { return Date.now(); } catch (e) { return +new Date(); } }

    function uuid() {
      try {
        var c = window.crypto;
        if (c && c.randomUUID) return c.randomUUID();
        if (c && c.getRandomValues) {
          var a = new Uint8Array(16);
          c.getRandomValues(a);
          a[6] = (a[6] & 0x0f) | 0x40;
          a[8] = (a[8] & 0x3f) | 0x80;
          var h = [];
          for (var i = 0; i < 16; i++) h.push((a[i] + 256).toString(16).slice(1));
          return h[0]+h[1]+h[2]+h[3]+'-'+h[4]+h[5]+'-'+h[6]+h[7]+'-'+h[8]+h[9]+'-'+h[10]+h[11]+h[12]+h[13]+h[14]+h[15];
        }
      } catch (e) {}
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
        var r = (Math.random() * 16) | 0;
        return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    }

    // Storage with graceful fallback to memory (private mode / blocked storage).
    var mem = {};
    function store(area, key, val) {
      try {
        var s = area === 's' ? window.sessionStorage : window.localStorage;
        if (val === undefined) return s.getItem(key);
        s.setItem(key, val);
        return val;
      } catch (e) {
        if (val === undefined) return key in mem ? mem[key] : null;
        mem[key] = val;
        return val;
      }
    }

    function scrubUrl(href) {
      try {
        var u = new URL(href, location.href);
        var drop = [];
        u.searchParams.forEach(function (_v, k) { if (SENSITIVE.test(k)) drop.push(k); });
        for (var i = 0; i < drop.length; i++) u.searchParams.delete(drop[i]);
        return u.href;
      } catch (e) {
        return String(href || '').split('#')[0];
      }
    }

    function meta(name, attr) {
      try {
        var el = document.querySelector('meta[' + (attr || 'property') + '="' + name + '"]');
        return el ? el.getAttribute('content') : null;
      } catch (e) { return null; }
    }

    // ── Identity ───────────────────────────────────────────────────────────
    var VISITOR = store('l', VID_KEY);
    if (!VISITOR) { VISITOR = uuid(); store('l', VID_KEY, VISITOR); }

    function sessionId() {
      var sid = store('s', SID_KEY);
      var last = parseInt(store('s', SLA_KEY) || '0', 10);
      var t = nowMs();
      if (!sid || (last && t - last > SESSION_TTL)) {
        sid = uuid();
        store('s', SID_KEY, sid);
      }
      store('s', SLA_KEY, '' + t);
      return sid;
    }

    // ── Platform + page-type detection ───────────────────────────────────────
    // The three funnel stages — Visit (page_view), Product View, Purchase
    // (checkout_complete) — must be detected reliably on each platform, which
    // differ in URLs, DOM, and class names. Strategy per page-type call:
    //   1) platform-NATIVE signal (most reliable): Shopify's analytics page
    //      type, Magento's body class, BigCommerce's product DOM.
    //   2) DOM signals (schema.org, data-* attributes, og:type).
    //   3) URL patterns (per-platform, then generic) as a last resort.
    function docClass() { try { return document.body ? (document.body.className || '') : ''; } catch (e) { return ''; } }

    function detectPlatform() {
      try {
        if (window.Shopify || window.ShopifyAnalytics || window.__st) return 'shopify';
        if (window.BCData || window.bcAnalytics || window.stencilBootstrap) return 'bigcommerce';
        if (window.Magento || window.Mage || /(^|\s)(catalog-|checkout-|cms-|customer-|catalogsearch-)/.test(docClass())) return 'adobe_commerce';
      } catch (e) {}
      var gen = (meta('generator', 'name') || '').toLowerCase();
      if (gen.indexOf('shopify') > -1) return 'shopify';
      if (gen.indexOf('bigcommerce') > -1) return 'bigcommerce';
      if (gen.indexOf('magento') > -1) return 'adobe_commerce';
      return 'custom';
    }

    // Platform can be unknown if the script runs before body/globals exist
    // (e.g. injected in <head>), so re-detect lazily until it locks on.
    var _platform = null;
    function platform() {
      if (_platform && _platform !== 'custom') return _platform;
      _platform = detectPlatform();
      return _platform;
    }

    // 1) Shopify — its analytics object exposes the canonical page type. On the
    // hosted checkout (URL contains /checkouts/) ShopifyAnalytics.meta may be
    // absent, but window.Shopify.Checkout is present and tells us the step — so we
    // check it first: a "thank_you"/order-status step is the Purchase, any other
    // step is the Checkout stage.
    function shopifyNativeType() {
      try {
        var co = window.Shopify && window.Shopify.Checkout;
        if (co && /\/checkouts?(\/|\b)/i.test(location.pathname)) {
          var step = String(co.step || co.page || '').toLowerCase();
          if (step.indexOf('thank') > -1 || co.isOrderStatusPage || co.OrderStatus) return 'confirmation';
          return 'checkout';
        }
        var a = window.ShopifyAnalytics;
        var pt = a && a.meta && a.meta.page && a.meta.page.pageType;
        pt = pt ? String(pt).toLowerCase() : '';
        if (pt === 'product') return 'product';
        if (pt === 'thank_you' || pt === 'order' || pt === 'order_status') return 'confirmation';
        if (pt === 'checkout') return 'checkout';
        if (pt === 'cart') return 'cart';
        if (pt === 'collection' || pt === 'list-collections') return 'category';
        if (pt === 'home' || pt === 'index') return 'home';
      } catch (e) {}
      return null;
    }

    // 1) Magento — page type is encoded in the <body> class.
    function magentoNativeType() {
      var c = docClass();
      if (!c) return null;
      if (/(^|\s)(checkout-onepage-success|checkout-success|onestepcheckout-success|firecheckout-success)(\s|$)/.test(c)) return 'confirmation';
      if (/(^|\s)catalog-product-view(\s|$)/.test(c)) return 'product';
      if (/(^|\s)checkout-cart-index(\s|$)/.test(c)) return 'cart';
      if (/(^|\s)(checkout-index-index|onepage|opc-|firecheckout-index)/.test(c)) return 'checkout';
      if (/(^|\s)(catalog-category-view|catalogsearch-result-index)(\s|$)/.test(c)) return 'category';
      if (/(^|\s)cms-index-index(\s|$)/.test(c)) return 'home';
      return null;
    }

    var PATTERNS = {
      shopify: {
        confirmation: /\/(thank_you|thank-you|orders\/[^/]+|checkouts\/[^/]+\/(thank[-_]you|orders))/i,
        checkout: /\/checkouts?(\/|\b)/i,
        product: /\/products\//i,
        cart: /\/cart(\/|\b)/i,
        category: /\/collections\//i
      },
      bigcommerce: {
        confirmation: /(\/checkout\/order-confirmation|\/order-confirmation|finishorder\.php|\/confirmation)/i,
        checkout: /\/checkout(\/|\b)/i,
        product: /\/products?\//i,
        cart: /(\/cart\.php|\/cart(\/|\b))/i,
        category: /\/categories?\//i
      },
      adobe_commerce: {
        confirmation: /\/(checkout\/onepage\/success|checkout\/success|onestepcheckout\/success)/i,
        checkout: /\/checkout(\/|$)/i,
        product: /\/catalog\/product\/view/i,
        cart: /\/checkout\/cart/i,
        category: /\/catalog\/category/i
      }
    };
    var GENERIC = {
      confirmation: /\/(thank[-_]?you|order[-_](received|confirmation|complete|success)|order-confirmation|success|orders?\/)/i,
      checkout: /\/checkout(\/|\b)/i,
      product: /\/(products?|item|p)\//i,
      cart: /\/(cart|basket|bag)(\/|\b)/i,
      category: /\/(collections?|categor|shop)(\/|\b)/i
    };

    function urlMatches(kind) {
      var path = location.pathname + location.search;
      var p = PATTERNS[platform()];
      if (p && p[kind] && p[kind].test(path)) return true;
      return GENERIC[kind].test(path);
    }

    // Cross-platform product signals (covers Shopify themes, Magento, and
    // BigCommerce Stencil which has no fixed product URL prefix).
    function domProduct() {
      try {
        var c = docClass();
        if (/(^|\s)(catalog-product-view|template-product|product-template|productView)(\s|$)/.test(c)) return true;
        if (document.querySelector(
          '[data-product-id],[data-product-handle],[data-entity-id],' +
          'form[action*="/cart/add"],form[action*="cart.php"],input[name="product_id"],' +
          '[itemtype$="schema.org/Product"],[itemtype$="/Product"],[data-test="product-title"]'
        )) return true;
        var og = meta('og:type');
        if (og && /product/i.test(og)) return true;
      } catch (e) {}
      return false;
    }

    // A rendered order id/number is the strongest "Purchase" signal.
    function hasOrderId() {
      try {
        return !!document.querySelector('[data-order-id],[data-order-number],[data-checkout-order-number],.order-number,.order-confirmation');
      } catch (e) { return false; }
    }

    function pageType() {
      var native = platform() === 'shopify' ? shopifyNativeType()
        : platform() === 'adobe_commerce' ? magentoNativeType()
        : null;
      if (native) return native;

      // DOM + URL fallback (order matters: confirmation before checkout,
      // since /checkout/onepage/success contains "/checkout").
      if (hasOrderId() || urlMatches('confirmation')) return 'confirmation';
      if (urlMatches('checkout') || /(^|\s)checkout/.test(docClass())) return 'checkout';
      if (domProduct() || urlMatches('product')) return 'product';
      if (urlMatches('cart')) return 'cart';
      if (urlMatches('category')) return 'category';
      var path = location.pathname;
      if (path === '/' || path === '') return 'home';
      return 'other';
    }

    // ── Event envelope + queue ─────────────────────────────────────────────
    function envelope(type, props) {
      return {
        event_type: type,
        session_id: sessionId(),
        visitor_id: VISITOR,
        page_url: scrubUrl(location.href),
        page_title: (document.title || '').slice(0, 300) || null,
        occurred_at: new Date().toISOString(),
        properties: props || {}
      };
    }

    var queue = [];
    function emit(type, props) {
      try { enqueue(envelope(type, props)); } catch (e) {}
    }
    // For interaction milestones (add_to_cart, begin-checkout) the page often
    // navigates immediately (Magento's "redirect to cart", "proceed to checkout"),
    // so the 5s flush timer never fires and only the unload beacon would carry
    // them — which the browser drops cross-origin for application/json. Send these
    // right away over fetch({keepalive:true}): survives navigation, real CORS.
    function emitNow(type, props) {
      try { enqueue(envelope(type, props)); flush(false); } catch (e) {}
    }
    function enqueue(ev) {
      if (!ev) return;
      queue.push(ev);
      if (queue.length >= MAX_BATCH) flush(false);
    }

    // ── Transport: fetch primary, XHR fallback, beacon on unload ─────────────
    function payload(batch) {
      return JSON.stringify({ connector_instance_id: CONNECTOR, events: batch });
    }

    function flush(useBeacon) {
      if (!queue.length) return;
      var batch = queue.splice(0, queue.length);
      send(batch, 0, !!useBeacon);
    }

    function send(batch, attempt, useBeacon) {
      var data = payload(batch);

      if (useBeacon) {
        try {
          if (navigator.sendBeacon && navigator.sendBeacon(INGEST, new Blob([data], { type: 'application/json' }))) return;
        } catch (e) {}
        // beacon unavailable/failed → fall through to a best-effort sync send
      }

      var onFail = function () { retry(batch, attempt, useBeacon); };

      if (window.fetch) {
        try {
          window.fetch(INGEST, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: data,
            keepalive: true,
            credentials: 'omit'
          }).then(function (r) { if (!r || !r.ok) onFail(); }, onFail);
          return;
        } catch (e) { /* fall through to XHR */ }
      }
      sendXHR(data, onFail);
    }

    function sendXHR(data, onFail) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', INGEST, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4 && (xhr.status < 200 || xhr.status >= 300)) onFail();
        };
        xhr.onerror = onFail;
        xhr.send(data);
      } catch (e) { onFail(); }
    }

    function retry(batch, attempt, useBeacon) {
      if (attempt >= MAX_RETRY) return; // 2 retries exhausted → silent drop
      setTimeout(function () { send(batch, attempt + 1, useBeacon); }, RETRY_MS);
    }

    // ── Auto events ───────────────────────────────────────────────────────
    var lastUrl = null;
    var lastPvUrl = null;
    var lastPvAt = 0;
    var inCheckout = false;
    var completed = false;
    var lastCheckoutStep = null;

    function emitPageView() {
      var url = location.href;
      var t = nowMs();
      if (url === lastPvUrl && t - lastPvAt < PV_DEDUPE_MS) return; // dedupe
      lastPvUrl = url;
      lastPvAt = t;
      emit('page_view', {
        page_type: pageType(),
        referrer: document.referrer ? scrubUrl(document.referrer) : null,
        platform: platform(),
        path: location.pathname
      });
    }

    function checkoutStep() {
      try {
        var el = document.querySelector('[data-checkout-step]');
        if (el) return el.getAttribute('data-checkout-step');
        var cls = docClass();
        var m = cls.match(/checkout-(\w+)/);
        if (m) return m[1];
      } catch (e) {}
      return null;
    }

    // Purchase details for the order-confirmation / thank-you page. Shopify
    // exposes the order on window.Shopify.checkout (order_id, order_number,
    // total_price, currency); fall back to DOM order-number markup otherwise.
    function orderInfo() {
      var info = {};
      try {
        var co = window.Shopify && window.Shopify.checkout;
        if (co) {
          if (co.order_id != null) info.order_id = String(co.order_id).slice(0, 100);
          if (co.order_number != null) info.order_number = String(co.order_number).slice(0, 100);
          if (co.total_price != null) info.total = String(co.total_price).slice(0, 40);
          if (co.currency) info.currency = String(co.currency).slice(0, 10);
        }
        if (!info.order_id) {
          var el = document.querySelector('[data-order-id],[data-order-number],[data-checkout-order-number]');
          if (el) {
            var v = el.getAttribute('data-order-id') || el.getAttribute('data-order-number') || el.getAttribute('data-checkout-order-number');
            if (v) info.order_id = String(v).slice(0, 100);
          }
        }
      } catch (e) {}
      return info;
    }

    function productInfo() {
      var info = {};
      try {
        var idEl = document.querySelector('[data-product-id]');
        if (idEl) info.product_id = (idEl.getAttribute('data-product-id') || '').slice(0, 100);

        var nameEl = document.querySelector('[data-product-name]');
        var name = (nameEl && nameEl.getAttribute('data-product-name')) || meta('og:title');
        if (name) info.product_name = String(name).slice(0, 200);

        var price = meta('product:price:amount') || meta('og:price:amount');
        if (price) info.price = String(price).slice(0, 40);
      } catch (e) {}
      return info;
    }

    // Fire the funnel event that corresponds to the current page, once per nav.
    function emitForPage() {
      var type = pageType();
      try {
        if (type === 'product') {
          emit('product_view', productInfo());
        } else if (type === 'checkout') {
          inCheckout = true;
          lastCheckoutStep = checkoutStep();
          // Watch for surfaced checkout error messages on this (or SPA-navigated) page.
          startCheckoutObserver();
          // Flush now: Shopify checkout steps live on /checkouts/ and the shopper
          // may advance/redirect before the periodic flush.
          emitNow('checkout_step', { step: lastCheckoutStep });
        } else if (type === 'confirmation') {
          completed = true;
          inCheckout = false;
          emitNow('checkout_complete', orderInfo());
        }
      } catch (e) {}
    }

    function onNav() {
      try {
        var url = location.href;
        if (url === lastUrl) return;
        lastUrl = url;
        emitPageView();
        emitForPage();
      } catch (e) {}
    }

    // SPA navigation: history patch + popstate + hashchange + poll backstop.
    function scheduleNav() {
      try {
        if (window.requestAnimationFrame) window.requestAnimationFrame(function () { setTimeout(onNav, 60); });
        else setTimeout(onNav, 60);
      } catch (e) { onNav(); }
    }

    function patchHistory(method) {
      try {
        var orig = history[method];
        if (typeof orig !== 'function') return;
        history[method] = function () {
          var r = orig.apply(this, arguments);
          try { scheduleNav(); } catch (e) {}
          return r;
        };
      } catch (e) {}
    }

    // Click tracking is OPT-IN only: we record a click ONLY when the clicked
    // element (or an ancestor within 6 levels) carries a [data-track] attribute.
    // Tracking every anchor/button click floods storefront_events and bloats the
    // DB, so we deliberately skip untagged clicks. Tag the few elements you care
    // about, e.g. <button data-track="add_to_cart">.
    function onClick(e) {
      try {
        var node = e.target;
        var match = null;
        var depth = 0;
        while (node && depth <= 6) {
          if (node.nodeType === 1 && node.getAttribute && node.getAttribute('data-track') !== null) {
            match = node;
            break;
          }
          node = node.parentNode;
          depth++;
        }
        if (!match) return; // untagged click — ignored (keeps the DB lean)

        var props = {
          tag: (match.tagName || '').toLowerCase(),
          id: match.id || null,
          classes: classOf(match),
          text: (match.innerText || match.textContent || '').trim().slice(0, 80) || null,
          track: match.getAttribute ? match.getAttribute('data-track') : null,
          href: null
        };
        if (props.tag === 'a' && match.getAttribute) {
          var href = match.getAttribute('href');
          if (href && href.charAt(0) !== '#' && href.toLowerCase().indexOf('javascript:') !== 0) {
            props.href = scrubUrl(href);
          }
        }
        emit('element_click', props);
      } catch (err) {}
    }

    function classOf(el) {
      try {
        var c = el.className;
        if (c && typeof c !== 'string' && c.baseVal != null) c = c.baseVal; // SVG
        return ('' + (c || '')).trim().slice(0, 120) || null;
      } catch (e) { return null; }
    }

    // ── Commerce interactions: add_to_cart + begin-checkout ──────────────────
    // Page-type detection alone misses two funnel stages:
    //   • Add-to-cart is almost always an AJAX action (Magento's
    //     #product-addtocart-button, Shopify/BigCommerce themes) that never
    //     navigates to /cart — so a cart page_view never fires and the stage
    //     reads zero. We capture the click/submit itself.
    //   • "Begin checkout" frequently redirects to an off-site checkout
    //     (Shopify Shop Pay, hosted checkout) where this script isn't installed,
    //     so checkout_step never fires. We capture the intent click before the
    //     redirect. The on-page checkout_step (emitForPage) still fires too.
    // Both map to canonical stages server-side; the session flags are monotonic
    // so a little duplication never double-counts a session in the funnel.
    var ADD_TO_CART_SEL =
      'form[action*="/cart/add"],form[action*="cart.php?action=add"],form[action*="checkout/cart/add"],' +
      '#product-addtocart-button,button.tocart,.action.tocart,[data-button-type="add-cart"],' +
      '#form-action-addToCart,button[name="add"],[data-add-to-cart],[data-track="add_to_cart"]';
    // Shopify: name="checkout" cart button, dynamic "Buy it now"
    // (.shopify-payment-button) and accelerated checkouts all leave for the
    // off-domain checkout. BigCommerce: [data-button-type="checkout"]. Adobe:
    // [data-role="proceed-to-checkout"].
    var CHECKOUT_SEL =
      '[name="checkout"],[data-button-type="checkout"],[data-role="proceed-to-checkout"],' +
      '#checkout,.cart__checkout,.shopify-payment-button,.additional-checkout-buttons,' +
      '[data-track="checkout_start"],[data-track="begin_checkout"]';
    var ADD_TEXT = /\badd\s*(to)?\s*(cart|bag|basket)\b/i;
    var CHECKOUT_TEXT = /\b(check\s?out|proceed to (payment|checkout)|place order)\b/i;

    var lastAddAt = 0;       // debounce form-submit + click double-fire
    var beganCheckout = false; // begin-checkout intent fires once per page load

    function closestMatch(node, selector) {
      var depth = 0;
      while (node && depth <= 6) {
        try {
          if (node.nodeType === 1 && node.matches && node.matches(selector)) return node;
        } catch (e) {}
        node = node.parentNode;
        depth++;
      }
      return null;
    }

    function ctrlText(el) {
      try { return (('' + (el.innerText || el.textContent || el.value || '')).trim()); }
      catch (e) { return ''; }
    }

    function onCommerce(e) {
      try {
        var target = e.target;

        // add_to_cart — selector match, or a button/submit labelled "add to cart".
        var add = closestMatch(target, ADD_TO_CART_SEL);
        if (!add) {
          var btn = closestMatch(target, 'button,input[type="submit"],input[type="button"]');
          if (btn && ADD_TEXT.test(ctrlText(btn))) add = btn;
        }
        if (add) {
          var t = nowMs();
          if (t - lastAddAt > 800) { lastAddAt = t; emitNow('add_to_cart', productInfo()); }
          return;
        }

        // begin checkout — once per page load (the redirect/AJAX takes over next).
        if (!beganCheckout) {
          var co = closestMatch(target, CHECKOUT_SEL);
          if (!co) {
            var link = closestMatch(target, 'a[href]');
            if (link) {
              var hp = (link.getAttribute('href') || '').toLowerCase();
              // a checkout link, but NOT the cart page (Adobe's cart is /checkout/cart).
              if (/\/checkout/.test(hp) && !/\/checkout\/cart/.test(hp) && !/cart\.php/.test(hp)) co = link;
            }
          }
          if (!co) {
            // A cart form that posts to /checkout(s) (Shopify/BigCommerce cart submit).
            var cf = closestMatch(target, 'form[action*="/checkout"]');
            if (cf) {
              var fa = (cf.getAttribute('action') || '').toLowerCase();
              if (!/\/checkout\/cart/.test(fa) && !/cart\.php/.test(fa)) co = cf;
            }
          }
          if (!co) {
            var b2 = closestMatch(target, 'button,input[type="submit"],input[type="button"]');
            if (b2 && CHECKOUT_TEXT.test(ctrlText(b2))) co = b2;
          }
          if (co) {
            beganCheckout = true;
            inCheckout = true;
            emitNow('checkout_step', { step: 'begin', trigger: 'click' });
          }
        }
      } catch (err) {}
    }

    // ── Network-level add-to-cart detection (theme-independent) ──────────────
    // DOM-click detection misses custom Magento frontends (Hyvä, PWA/GraphQL)
    // whose buttons don't use Luma's #product-addtocart-button / .tocart markup.
    // Every add-to-cart, however, hits a known endpoint: Luma POSTs
    // /checkout/cart/add, GraphQL stores POST an addProductsToCart mutation to
    // /graphql, the REST API hits /rest/.../carts/.../items (and Shopify
    // /cart/add.js, BigCommerce /cart.php?action=add). We observe — never alter —
    // those requests by wrapping fetch + XHR, so add_to_cart fires on every
    // platform/theme regardless of how the button is built.
    var ADD_URL = /(\/checkout\/cart\/add)|(\/cart\/add(\.js)?(\?|\/|$))|(cart\.php\?[^]*action=add)|(\/rest\/[^]*\/carts?\/[^]*\/items)/i;
    var CART_GQL = /add(simple|configurable|bundle|virtual|downloadable)?products?tocart|addtocart|additemtocart/i;

    function noteCartRequest(url, method, body) {
      try {
        if (!url) return;
        var u = String(url);
        if (INGEST && u.indexOf(INGEST) === 0) return;        // never our own ingest
        if (String(method || 'GET').toUpperCase() !== 'POST') return;
        if (/\/graphql(\?|$|\/)/i.test(u)) {
          // /graphql carries everything — only count add-to-cart mutations.
          if (!body || !CART_GQL.test(String(body))) return;
        } else if (!ADD_URL.test(u)) {
          return;
        }
        var t = nowMs();
        if (t - lastAddAt > 800) { lastAddAt = t; emitNow('add_to_cart', productInfo()); } // debounce vs DOM-click
      } catch (e) {}
    }

    function patchNetwork() {
      try {
        if (window.fetch && !window.fetch.__plat) {
          var of = window.fetch;
          var pf = function (input, init) {
            var url = '';
            var method = 'GET';
            try {
              url = typeof input === 'string' ? input : (input && input.url) || '';
              method = (init && init.method) || (input && input.method) || 'GET';
              var b = init && init.body;
              noteCartRequest(url, method, typeof b === 'string' ? b : null);
            } catch (e) {}
            var start = nowMs();
            var p;
            try { p = of.apply(this, arguments); } catch (e) { try { noteNetwork(url, method, 0, nowMs() - start, true); } catch (e2) {} throw e; }
            try {
              if (p && p.then) {
                return p.then(function (resp) {
                  try { noteNetwork(url, method, resp && resp.status, nowMs() - start, false); } catch (e) {}
                  return resp;
                }, function (err) {
                  try { noteNetwork(url, method, 0, nowMs() - start, true); } catch (e) {}
                  throw err;
                });
              }
            } catch (e) {}
            return p;
          };
          pf.__plat = true;
          window.fetch = pf;
        }
      } catch (e) {}
      try {
        var XHR = window.XMLHttpRequest;
        if (XHR && XHR.prototype && !XHR.prototype.__plat) {
          var oo = XHR.prototype.open;
          var os = XHR.prototype.send;
          XHR.prototype.open = function (method, url) {
            try { this.__platM = method; this.__platU = url; } catch (e) {}
            return oo.apply(this, arguments);
          };
          XHR.prototype.send = function (body) {
            try { noteCartRequest(this.__platU, this.__platM, typeof body === 'string' ? body : null); } catch (e) {}
            try {
              var self = this;
              var start = nowMs();
              self.addEventListener('readystatechange', function () {
                try {
                  if (self.readyState === 4) {
                    noteNetwork(self.__platU, self.__platM, self.status, nowMs() - start, self.status === 0);
                  }
                } catch (e) {}
              });
            } catch (e) {}
            return os.apply(this, arguments);
          };
          XHR.prototype.__plat = true;
        }
      } catch (e) {}
    }

    // ── Error & issue capture (RUM) ──────────────────────────────────────────
    // Storefront errors are a SEPARATE concern from the purchase-journey events
    // above: they post to RUM_INGEST (/api/rum/errors), with the
    // `{ errors: [...] }` shape that endpoint expects — never to /api/track. Each
    // event carries connector_instance_id, platform, page_url, session_id and a
    // timestamp. Every handler is wrapped in try/catch and must never throw: the
    // tracker stays silent even if error capture itself fails.
    var STACK_MAX = 4000;     // truncate stack traces to a sane length
    var MSG_MAX = 1000;       // error message cap
    var SLOW_MS = 3000;       // a network call slower than this is flagged

    function truncate(s, n) {
      try { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }
      catch (e) { return ''; }
    }

    // Per-platform source patterns that mark an error as platform-specific.
    var PLATFORM_ERR_RE = {
      shopify: /(theme\.js|\/sections\/|\/assets\/|shopify[_-]?pay|shop[_-]?pay|shopify\.js|shopify_common)/i,
      bigcommerce: /(theme\.js|cornerstone|stencil-utils|stencil)/i,
      adobe_commerce: /(require\.?js|requirejs|knockout(\.js)?|\/Magento_)/i
    };
    function platformPattern(src) {
      try {
        var re = PLATFORM_ERR_RE[platform()];
        return !!(re && src && re.test(String(src)));
      } catch (e) { return false; }
    }

    // RUM transport: its own queue + endpoint (separate from the /api/track one).
    var rumQueue = [];
    var rumTimer = null;
    function rumSend(batch, useBeacon) {
      if (!RUM_INGEST || !batch.length) return;
      var data = JSON.stringify({ errors: batch });
      if (useBeacon) {
        try { if (navigator.sendBeacon && navigator.sendBeacon(RUM_INGEST, new Blob([data], { type: 'application/json' }))) return; } catch (e) {}
      }
      if (window.fetch) {
        try {
          // Goes through our patched fetch, but noteNetwork skips RUM_PATH, so no loop.
          window.fetch(RUM_INGEST, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data, keepalive: true, credentials: 'omit', mode: 'cors' }).then(function () {}, function () {});
          return;
        } catch (e) {}
      }
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', RUM_INGEST, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(data);
      } catch (e) {}
    }
    function rumFlush(useBeacon) {
      try {
        if (rumTimer) { clearTimeout(rumTimer); rumTimer = null; }
        if (!rumQueue.length) return;
        var batch = rumQueue.splice(0, rumQueue.length);
        rumSend(batch, !!useBeacon);
      } catch (e) {}
    }
    function rumSchedule() {
      try {
        if (rumQueue.length >= MAX_BATCH) return rumFlush(false);
        if (!rumTimer) rumTimer = setTimeout(function () { try { rumFlush(false); } catch (e) {} }, FLUSH_MS);
      } catch (e) {}
    }
    function rumEmit(type, extra) {
      try {
        if (!RUM_INGEST) return;
        var ev = {
          error_type: type,
          connector_instance_id: CONNECTOR,
          platform: platform(),
          page_url: scrubUrl(location.href),
          session_id: sessionId(),
          occurred_at: new Date().toISOString()
        };
        if (extra) {
          for (var k in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, k) && extra[k] != null) ev[k] = extra[k];
          }
        }
        rumQueue.push(ev);
        rumSchedule();
      } catch (e) {}
    }

    // 1 — JavaScript errors: window.onerror (unhandled exceptions, chained so we
    // don't clobber a host handler) + unhandledrejection (Promise rejections).
    function captureJsError(message, source, lineno, colno, error) {
      try {
        var stack = (error && error.stack) || '';
        var meta = { platform: platform(), line_no: lineno != null ? lineno : null, col_no: colno != null ? colno : null };
        if (platformPattern(source) || platformPattern(stack)) meta.platform_pattern = true;
        rumEmit('js_error', {
          message: truncate(message || 'Script error', MSG_MAX),
          source_url: source ? scrubUrl(source) : null,
          stack_trace: truncate(stack, STACK_MAX),
          metadata: meta
        });
      } catch (e) {}
    }

    // 2 — Resource load failures: capture-phase 'error' listener, filtered to
    // resource elements only so JS errors (handled by window.onerror) don't
    // double-fire. No HTTP status is available from the browser → "load_error".
    function captureResourceError(ev) {
      try {
        var t = ev && ev.target;
        if (!t || t === window) return;
        var isImg = !!(window.HTMLImageElement && t instanceof HTMLImageElement);
        var isScript = !!(window.HTMLScriptElement && t instanceof HTMLScriptElement);
        var isLink = !!(window.HTMLLinkElement && t instanceof HTMLLinkElement);
        var isVideo = !!(window.HTMLVideoElement && t instanceof HTMLVideoElement);
        if (!(isImg || isScript || isLink || isVideo)) return;
        var url = t.src || t.href || '';
        var tag = (t.tagName || '').toUpperCase();
        var low = String(url).toLowerCase();
        var meta = { platform: platform(), status: 'load_error' };
        if (/(stripe\.js|razorpay\.js|paypal\.js|adyen\.js|checkout\.js)/.test(low) || low.indexOf('payment') > -1) meta.critical_payment = true;
        if (low.indexOf('cart') > -1) meta.critical_cart = true;
        if (low.indexOf('checkout') > -1) meta.critical_checkout = true;
        rumEmit('resource_error', {
          message: tag + ' failed to load: ' + truncate(scrubUrl(url), 500),
          request_url: url ? scrubUrl(url) : null,
          source_url: url ? scrubUrl(url) : null,
          resource_tag: tag,
          metadata: meta
        });
      } catch (e) {}
    }

    // 3 — Network/API failures: called from the patched fetch + XHR above. Only
    // same-host calls, never our own /api/track or /api/rum ingest (loop guard).
    function isOwnIngest(u) {
      try {
        u = String(u || '');
        if (INGEST && u.indexOf(INGEST) === 0) return true;
        if (u.indexOf(RUM_PATH) > -1) return true;
        return false;
      } catch (e) { return true; }
    }
    function sameHost(u) {
      try { return new URL(u, location.href).hostname === location.hostname; }
      catch (e) { return false; }
    }
    function noteNetwork(url, method, status, duration, errored) {
      try {
        if (!url || isOwnIngest(url) || !sameHost(url)) return;
        status = (typeof status === 'number') ? status : 0;
        var slow = duration > SLOW_MS;
        var failed = !!errored || status >= 400 || status === 0;
        if (!failed && !slow) return;
        var m = String(method || 'GET').toUpperCase();
        rumEmit('network_error', {
          message: truncate((errored || status === 0 ? 'Request failed: ' : 'HTTP ' + status + ' ') + m + ' ' + scrubUrl(url), MSG_MAX),
          request_url: scrubUrl(url),
          status_code: status || null,
          http_method: m,
          duration_ms: Math.round(duration),
          metadata: { platform: platform(), slow: !!slow, failed: !!failed }
        });
      } catch (e) {}
    }

    // 4 — Checkout-specific DOM errors: only on the checkout page. Watch added
    // nodes for error containers and capture their (deduped) text, ≤300 chars.
    var CHECKOUT_ERR_SEL =
      '[data-error],.error-message,.alert-error,.notice--error,' +
      '[class*="error"],[class*="Error"],[role="alert"],' +
      '.field__message--error,' +                       // shopify
      '.alertBox--error,.form-field--error,' +          // bigcommerce
      '.message-error,.field-error,.mage-error';        // adobe commerce
    var checkoutObserver = null;
    var seenCheckoutErr = {};
    function checkoutErrText(node) {
      try {
        if (!node || node.nodeType !== 1) return '';
        if (node.matches && node.matches(CHECKOUT_ERR_SEL)) {
          var t = (node.innerText || node.textContent || '').trim();
          if (t) return t;
        }
        if (node.querySelector) {
          var inner = node.querySelector(CHECKOUT_ERR_SEL);
          if (inner) {
            var t2 = (inner.innerText || inner.textContent || '').trim();
            if (t2) return t2;
          }
        }
      } catch (e) {}
      return '';
    }
    function startCheckoutObserver() {
      try {
        if (checkoutObserver || !window.MutationObserver || !document.body) return;
        if (pageType() !== 'checkout') return;
        checkoutObserver = new MutationObserver(function (mutations) {
          try {
            for (var i = 0; i < mutations.length; i++) {
              var added = mutations[i].addedNodes;
              if (!added) continue;
              for (var j = 0; j < added.length; j++) {
                var txt = checkoutErrText(added[j]);
                if (!txt) continue;
                txt = txt.slice(0, 300);
                if (seenCheckoutErr[txt]) continue; // dedupe identical text
                seenCheckoutErr[txt] = 1;
                rumEmit('checkout_error', { message: txt, metadata: { platform: platform() } });
              }
            }
          } catch (e) {}
        });
        checkoutObserver.observe(document.body, { childList: true, subtree: true });
      } catch (e) {}
    }

    // 5 — Console errors (filtered): wrap console.error, preserve the original,
    // join args, cap to 500 chars, skip our own ingest URLs and __plat noise.
    function patchConsole() {
      try {
        if (!window.console || typeof console.error !== 'function' || console.error.__plat) return;
        var orig = console.error;
        var patched = function () {
          try {
            var parts = [];
            for (var i = 0; i < arguments.length; i++) {
              var a = arguments[i];
              try {
                if (a instanceof Error) parts.push(a.message + (a.stack ? ' ' + a.stack : ''));
                else if (a && typeof a === 'object') parts.push(JSON.stringify(a));
                else parts.push(String(a));
              } catch (e) { parts.push(String(a)); }
            }
            var msg = parts.join(' ').slice(0, 500);
            if (msg &&
                msg.indexOf(RUM_PATH) === -1 &&
                (!INGEST || msg.indexOf(INGEST) === -1) &&
                msg.indexOf('__plat') === -1) {
              rumEmit('console_error', { message: msg, metadata: { platform: platform() } });
            }
          } catch (e) {}
          return orig.apply(this, arguments);
        };
        patched.__plat = true;
        console.error = patched;
      } catch (e) {}
    }

    function wireErrorCapture() {
      try {
        var prevOnError = window.onerror;
        window.onerror = function (message, source, lineno, colno, error) {
          captureJsError(message, source, lineno, colno, error);
          if (typeof prevOnError === 'function') { try { return prevOnError.apply(this, arguments); } catch (e) {} }
          return false;
        };
      } catch (e) {}
      try {
        window.addEventListener('unhandledrejection', function (ev) {
          try {
            var r = ev && ev.reason;
            var stack = (r && r.stack) || '';
            var meta = { platform: platform() };
            if (platformPattern(stack)) meta.platform_pattern = true;
            rumEmit('promise_rejection', {
              message: truncate((r && r.message) || String(r) || 'Unhandled promise rejection', MSG_MAX),
              stack_trace: truncate(stack, STACK_MAX),
              metadata: meta
            });
          } catch (e) {}
        });
      } catch (e) {}
      try { window.addEventListener('error', captureResourceError, true); } catch (e) {}
      patchConsole();
      startCheckoutObserver();
    }

    // Abandonment + final flush on unload.
    function onUnload() {
      try {
        if (inCheckout && !completed) {
          enqueue(envelope('checkout_abandon', { step: lastCheckoutStep }));
        }
        flush(true);
        rumFlush(true);
      } catch (e) {}
    }

    // ── Public API ─────────────────────────────────────────────────────────
    window.track = function (type, props) {
      try { if (type) emit(String(type), props && typeof props === 'object' ? props : {}); } catch (e) {}
    };
    // Drain any pre-load queued calls: window._platq = [['type', {..}], ...]
    try {
      var pre = window._platq;
      if (pre && pre.length) {
        for (var i = 0; i < pre.length; i++) {
          try { window.track.apply(null, pre[i]); } catch (e) {}
        }
        window._platq = [];
      }
    } catch (e) {}

    // ── Wire up ──────────────────────────────────────────────────────────
    patchNetwork(); // observe add-to-cart XHR/fetch (theme-independent)
    wireErrorCapture(); // js/promise/resource/network/checkout/console capture
    patchHistory('pushState');
    patchHistory('replaceState');
    try {
      window.addEventListener('popstate', scheduleNav);
      window.addEventListener('hashchange', scheduleNav);
      document.addEventListener('click', onClick, true);
      document.addEventListener('click', onCommerce, true);
      document.addEventListener('submit', onCommerce, true);
      window.addEventListener('pagehide', onUnload);
      window.addEventListener('beforeunload', onUnload);
      document.addEventListener('visibilitychange', function () {
        try { if (document.visibilityState === 'hidden') { flush(true); rumFlush(true); } } catch (e) {}
      });
    } catch (e) {}

    // 500ms poll backstop for SPA frameworks that bypass history hooks.
    try { setInterval(function () { try { onNav(); } catch (e) {} }, 500); } catch (e) {}

    // Periodic flush.
    try { setInterval(function () { try { flush(false); } catch (e) {} }, FLUSH_MS); } catch (e) {}

    // First navigation (initial page load).
    onNav();
  } catch (e) {
    // Whole-script guard: never throw into the host page.
  }
})();