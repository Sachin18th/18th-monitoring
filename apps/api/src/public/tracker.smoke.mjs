// Real-browser smoke test for the storefront tracker.
//   node apps/api/src/public/tracker.smoke.mjs
// Loads tracker.js on a fake product page, captures the ingest POST(s), and
// asserts page_view + product_view + element_click fire with a Phase-1-shaped
// payload, plus checkout_step/checkout_complete on SPA navigation.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import puppeteer from 'puppeteer';

const here = dirname(fileURLToPath(import.meta.url));
const trackerJs = readFileSync(join(here, 'tracker.js'), 'utf8');

const INGEST = 'https://ingest.test/api/track';
const captured = [];

function page(pathname, body) {
  return `<!doctype html><html><head>
    <meta property="og:type" content="product">
    <meta property="og:title" content="Test Widget">
    <title>Test Widget — Shop</title>
  </head><body class="template-product">
    ${body || ''}
    <script>history.replaceState({}, '', '${pathname}');</script>
    <script data-connector-id="conn_smoke_123" data-ingest-url="${INGEST}">${trackerJs}</script>
  </body></html>`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const p = await browser.newPage();
  p.on('console', (m) => console.log('  [browser]', m.type(), m.text()));
  p.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await p.setRequestInterception(true);
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  p.on('request', (req) => {
    if (req.url() === INGEST && req.method() === 'OPTIONS') {
      return req.respond({ status: 204, headers: cors, body: '' });
    }
    if (req.method() === 'POST' && req.url() === INGEST) {
      try { captured.push(JSON.parse(req.postData() || '{}')); } catch { captured.push({ parseError: true }); }
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"accepted":1,"rejected":0}' });
    }
    if (req.url().startsWith('http://localhost.test/')) {
      const path = new URL(req.url()).pathname;
      const isCheckout = path.indexOf('/checkout') === 0;
      const isConfirm = path.indexOf('/thank_you') === 0;
      const extra = isConfirm ? '<div data-order-id="ORD-9001"></div>' : '';
      const cls = isCheckout ? 'checkout-shipping' : isConfirm ? 'confirmation' : 'template-product';
      const html = `<!doctype html><html><head><title>${path}</title></head>
        <body class="${cls}">${extra}<button data-track="cta">Buy now</button>
        <script data-connector-id="conn_smoke_123" data-ingest-url="${INGEST}">${trackerJs}</script></body></html>`;
      return req.respond({ status: 200, contentType: 'text/html', body: html });
    }
    return req.continue();
  });

  // ── Load a product page ──────────────────────────────────────────────────
  await p.goto('http://localhost.test/products/test-widget', { waitUntil: 'domcontentloaded' });
  await sleep(200);
  const diag = await p.evaluate(() => ({
    hasTrack: typeof window.track,
    vid: window.localStorage.getItem('__plat_vid'),
    sid: window.sessionStorage.getItem('__plat_sid'),
  }));
  console.log('  [diag]', JSON.stringify(diag));
  await p.evaluate(() => window.track('custom_demo', { foo: 1 }));
  await p.click('button[data-track]');

  // SPA navigations: product → checkout → confirmation
  await p.evaluate(() => history.pushState({}, '', '/checkout/shipping'));
  await sleep(250);
  // simulate checkout DOM by swapping a marker, then a confirmation nav
  await p.evaluate(() => { document.body.className = 'checkout-payment'; });
  await p.evaluate(() => history.pushState({}, '', '/checkout/payment'));
  await sleep(250);
  await p.evaluate(() => {
    document.body.className = 'confirmation';
    const d = document.createElement('div'); d.setAttribute('data-order-id', 'ORD-42'); document.body.appendChild(d);
    history.pushState({}, '', '/thank_you');
  });
  await sleep(250);

  // Force a fetch-based flush by crossing the 10-event batch threshold.
  await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
  await sleep(500);
  // Also exercise the unload/beacon path.
  await p.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
  await sleep(400);

  // ── Scenario 2: Magento single-pageview visit — identity must still arrive ──
  // A fresh tab loads ONE page (no clicks, no navigation). The tracker's async
  // section-load probe resolves AFTER the page_view is enveloped; the fix emits
  // a synthetic identity event (element_click / track:"identity_resolved") the
  // moment the probe completes, so even a bounce session carries identity.
  const captured2 = [];
  const p2 = await browser.newPage();
  p2.on('pageerror', (e) => console.log('  [p2 pageerror]', e.message));
  await p2.setRequestInterception(true);
  p2.on('request', (req) => {
    const url = req.url();
    if (url === INGEST && req.method() === 'OPTIONS') {
      return req.respond({ status: 204, headers: cors, body: '' });
    }
    if (url === INGEST && req.method() === 'POST') {
      try { captured2.push(JSON.parse(req.postData() || '{}')); } catch { captured2.push({ parseError: true }); }
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"accepted":1,"rejected":0}' });
    }
    if (url.startsWith('http://localhost.test/customer/section/load/')) {
      return req.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ customer: { fullname: 'Jane Smith', firstname: 'Jane', websiteId: '1' } }),
      });
    }
    if (url.startsWith('http://localhost.test/')) {
      const html = `<!doctype html><html><head><title>Home</title></head>
        <body class="cms-index-index">
        <script data-connector-id="conn_smoke_123" data-ingest-url="${INGEST}">${trackerJs}</script></body></html>`;
      return req.respond({ status: 200, contentType: 'text/html', body: html });
    }
    return req.continue();
  });
  await p2.goto('http://localhost.test/', { waitUntil: 'domcontentloaded' });
  await sleep(900); // probe fetch + emitNow flush — no user interaction at all
  const events2 = captured2.flatMap((b) => b.events || []);
  const idSignal = events2.find(
    (e) => e.event_type === 'element_click' && e.properties && e.properties.track === 'identity_resolved'
  );

  const events = captured.flatMap((b) => b.events || []);
  const types = events.map((e) => e.event_type);
  const connectorOk = captured.every((b) => b.connector_instance_id === 'conn_smoke_123');
  const shapeOk = events.every((e) =>
    e.session_id && e.visitor_id && e.event_type && e.occurred_at && typeof e.properties === 'object'
  );
  const pv = events.find((e) => e.event_type === 'page_view');
  const visitorStable = new Set(events.map((e) => e.visitor_id)).size === 1;

  const checks = {
    'connector_instance_id on every batch': connectorOk,
    'every event has session/visitor/type/occurred_at/properties': shapeOk,
    'page_view emitted': types.includes('page_view'),
    'product_view emitted': types.includes('product_view'),
    'element_click emitted': types.includes('element_click'),
    'checkout_step emitted': types.includes('checkout_step'),
    'checkout_complete emitted': types.includes('checkout_complete'),
    'custom window.track event emitted': types.includes('custom_demo'),
    'page_view carries page_type property': !!(pv && pv.properties && pv.properties.page_type),
    'visitor_id stable across events': visitorStable,
    'identity signal emitted on single-pageview visit (name + id_probe)': !!(
      idSignal &&
      idSignal.properties.customer_name === 'Jane Smith' &&
      idSignal.properties.id_probe === 'mage_section:ok'
    ),
  };

  let ok = true;
  for (const [name, pass] of Object.entries(checks)) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
    if (!pass) ok = false;
  }
  console.log('\nevent types seen:', types.join(', ') || '(none)');
  console.log('total events captured:', events.length);

  await browser.close();
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error('smoke test error:', err);
  await browser.close();
  process.exit(2);
}