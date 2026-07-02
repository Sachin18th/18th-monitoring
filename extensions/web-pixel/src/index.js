import { register } from "@shopify/web-pixels-extension";

/**
 * KPI Monitoring Web Pixel.
 *
 * Runs in Shopify's strict pixel sandbox. Subscribes to the checkout customer
 * events and forwards each one to the platform ingest endpoint (POST /api/track)
 * in the exact contract the ingest pipeline expects:
 *
 *   { project_id, connector_instance_id, source: "web_pixel", platform: "shopify",
 *     events: [ { event_type, session_id, visitor_id, occurred_at, ... } ] }
 *
 * Contract notes (enforced by StorefrontTrackingService.normalizeEvent):
 *   - event_type MUST be a canonical type: checkout_step | checkout_complete.
 *   - session_id AND visitor_id MUST both be non-empty, or the event is dropped.
 *     visitor_id = the pixel clientId (stable per browser); session_id = the
 *     checkout token, so every step of one checkout folds into a single session.
 *
 * Config (ingestUrl / connectorInstanceId / projectId) comes from the webPixel
 * `settings` registered server-side — see shopify.extension.toml for the schema.
 */
register(({ analytics, settings, init }) => {
  const ENDPOINT = settings.ingestUrl;
  const CONNECTOR_ID = settings.connectorInstanceId;
  const PROJECT_ID = settings.projectId;

  // No endpoint configured → nothing to do (avoid throwing in the sandbox).
  if (!ENDPOINT || !CONNECTOR_ID) return;

  function sendEvent(event, eventType, props) {
    const checkout = (event.data && event.data.checkout) || {};
    const clientId = event.clientId || (init && init.data && init.data.clientId) || null;
    const sessionId = checkout.token || clientId;
    const visitorId = clientId || checkout.token;
    // Both ids must be present, else the ingest pipeline rejects the event.
    if (!sessionId || !visitorId) return;

    const ctx = event.context || {};
    const pageUrl =
      (ctx.document && ctx.document.location && ctx.document.location.href) || null;

    const body = {
      event_type: eventType,
      session_id: sessionId,
      visitor_id: visitorId,
      occurred_at: event.timestamp || new Date().toISOString(),
      page_url: pageUrl,
      source_platform: "shopify",
      page_type: "checkout",
    };
    for (const k in props) {
      if (props[k] !== undefined) body[k] = props[k];
    }

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: PROJECT_ID,
        connector_instance_id: CONNECTOR_ID,
        source: "web_pixel",
        platform: "shopify",
        events: [body],
      }),
      keepalive: true,
    }).catch(() => {});
  }

  analytics.subscribe("checkout_started", (event) => {
    const checkout = (event.data && event.data.checkout) || {};
    sendEvent(event, "checkout_step", {
      step: "started",
      checkout_token: checkout.token,
      total_price: checkout.totalPrice && checkout.totalPrice.amount,
      currency: checkout.currencyCode,
      line_item_count: checkout.lineItems ? checkout.lineItems.length : 0,
    });
  });

  analytics.subscribe("checkout_contact_info_submitted", (event) => {
    const checkout = (event.data && event.data.checkout) || {};
    sendEvent(event, "checkout_step", {
      step: "contact_info",
      checkout_token: checkout.token,
      ...(checkout.email ? { email: checkout.email } : {}),
    });
  });

  analytics.subscribe("checkout_address_info_submitted", (event) => {
    const checkout = (event.data && event.data.checkout) || {};
    sendEvent(event, "checkout_step", {
      step: "address_info",
      checkout_token: checkout.token,
      ...(checkout.email ? { email: checkout.email } : {}),
    });
  });

  analytics.subscribe("checkout_shipping_info_submitted", (event) => {
    const checkout = (event.data && event.data.checkout) || {};
    sendEvent(event, "checkout_step", {
      step: "shipping_info",
      checkout_token: checkout.token,
      shipping_method: checkout.shippingLine && checkout.shippingLine.title,
      ...(checkout.email ? { email: checkout.email } : {}),
    });
  });

  analytics.subscribe("payment_info_submitted", (event) => {
    const checkout = (event.data && event.data.checkout) || {};
    sendEvent(event, "checkout_step", {
      step: "payment_info",
      checkout_token: checkout.token,
      ...(checkout.email ? { email: checkout.email } : {}),
    });
  });

  analytics.subscribe("checkout_completed", (event) => {
    const checkout = (event.data && event.data.checkout) || {};
    const order = checkout.order || {};
    sendEvent(event, "checkout_complete", {
      step: "completed",
      order_id: order.id,
      order_number: order.number,
      total_price: checkout.totalPrice && checkout.totalPrice.amount,
      currency: checkout.currencyCode,
      checkout_token: checkout.token,
      line_item_count: checkout.lineItems ? checkout.lineItems.length : 0,
      ...(checkout.email ? { email: checkout.email } : {}),
    });
  });
});