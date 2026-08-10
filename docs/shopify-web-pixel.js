// Shopify Custom Web Pixel — checkout capture (CORRECTED: now sends email + customer id
// so the CDP links checkout events to the customer profile and confirms completion).
const ENDPOINT = "https://unredressed-renna-nondemanding.ngrok-free.dev/api/track";
const CONNECTOR_ID = "99900108-c8a0-4b4a-a602-325d8bea212e";
const PROJECT_ID = ""; // optional
// ───────────────────────────────────────────────────

function sendEvent(event, eventType, props) {
  const checkout = (event.data && event.data.checkout) || {};
  const clientId = event.clientId || null;
  const sessionId = checkout.token || clientId;
  const visitorId = clientId || checkout.token;
  if (!sessionId || !visitorId) return;
  const ctx = event.context || {};
  const pageUrl = (ctx.document && ctx.document.location && ctx.document.location.href) || null;

  const body = {
    event_type: eventType,
    session_id: sessionId,
    visitor_id: visitorId,
    occurred_at: event.timestamp || new Date().toISOString(),
    page_url: pageUrl,
    source_platform: "shopify",
    page_type: "checkout"
  };
  for (const k in props) { if (props[k] !== undefined) body[k] = props[k]; }

  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: PROJECT_ID,
      connector_instance_id: CONNECTOR_ID,
      source: "web_pixel",
      platform: "shopify",
      events: [body]
    }),
    keepalive: true
  }).catch(() => {});
}

// Pull the identity Shopify exposes on a checkout: email (from contact step onward)
// and the logged-in customer id. The CDP hashes the email server-side (never stored
// in plaintext) and uses it to resolve the checkout to the right customer profile.
function identityOf(checkout) {
  const c = checkout || {};
  return {
    email: c.email || (c.order && c.order.customer && c.order.customer.email) || undefined,
    customer_id: (c.order && c.order.customer && c.order.customer.id) || undefined
  };
}

analytics.subscribe("checkout_started", (event) => {
  const c = (event.data && event.data.checkout) || {};
  sendEvent(event, "checkout_step", { step: "started", checkout_token: c.token, total_price: c.totalPrice && c.totalPrice.amount, currency: c.currencyCode, line_item_count: c.lineItems ? c.lineItems.length : 0, ...identityOf(c) });
});
analytics.subscribe("checkout_contact_info_submitted", (event) => {
  const c = (event.data && event.data.checkout) || {};
  sendEvent(event, "checkout_step", { step: "contact_info", checkout_token: c.token, ...identityOf(c) });
});
analytics.subscribe("checkout_address_info_submitted", (event) => {
  const c = (event.data && event.data.checkout) || {};
  sendEvent(event, "checkout_step", { step: "address_info", checkout_token: c.token, ...identityOf(c) });
});
analytics.subscribe("checkout_shipping_info_submitted", (event) => {
  const c = (event.data && event.data.checkout) || {};
  sendEvent(event, "checkout_step", { step: "shipping_info", checkout_token: c.token, shipping_method: c.shippingLine && c.shippingLine.title, ...identityOf(c) });
});
analytics.subscribe("payment_info_submitted", (event) => {
  const c = (event.data && event.data.checkout) || {};
  sendEvent(event, "checkout_step", { step: "payment_info", checkout_token: c.token, ...identityOf(c) });
});
analytics.subscribe("checkout_completed", (event) => {
  const c = (event.data && event.data.checkout) || {};
  const o = c.order || {};
  sendEvent(event, "checkout_complete", { step: "completed", order_id: o.id, order_number: o.number, total_price: c.totalPrice && c.totalPrice.amount, currency: c.currencyCode, checkout_token: c.token, line_item_count: c.lineItems ? c.lineItems.length : 0, ...identityOf(c) });
});
