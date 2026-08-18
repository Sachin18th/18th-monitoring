// PWA / headless-storefront identity smoke test for the storefront tracker.
//   node apps/api/src/public/tracker.identity.smoke.mjs
// A headless front-end exposes none of the platform globals (Shopify/BCData/
// Magento), so platform() === 'custom' and every probe in identityInfo() is a
// no-op. Identity there comes only from window.track.identify(), the pre-load
// _platq queue, or a server-rendered window.__PLAT_CUSTOMER__.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import puppeteer from 'puppeteer';

const here = dirname(fileURLToPath(import.meta.url));
const trackerJs = readFileSync(join(here, 'tracker.js'), 'utf8');
const INGEST = 'https://ingest.test/api/track';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { console.log('PASS ', label); pass++; }
  else { console.log('FAIL ', label, extra === undefined ? '' : JSON.stringify(extra)); fail++; }
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// A plain SPA shell: no platform globals, no platform body classes.
const shell = (head, body) => `<!doctype html><html><head><title>PWA Shop</title>${head || ''}</head>
  <body class="app-shell"><div id="root">${body || ''}</div>
  <button data-track="cta">Buy</button>
  <script data-connector-id="conn_pwa_1" data-ingest-url="${INGEST}">${trackerJs}</script></body></html>`;

// Every scenario gets its own browser context: pages otherwise share one
// profile, so localStorage seeded by a Venia scenario would leak into the next
// and silently resolve identity there.
async function newPage(browser, html, graphql) {
  const captured = [];
  const gql = [];
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.__ctx = ctx;
  p.__gql = gql;
  p.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await p.setRequestInterception(true);
  p.on('request', (req) => {
    if (req.url() === INGEST && req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors, body: '' });
    if (req.method() === 'POST' && req.url() === INGEST) {
      try { captured.push(JSON.parse(req.postData() || '{}')); } catch { captured.push({ parseError: true }); }
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"accepted":1,"rejected":0}' });
    }
    if (req.url().endsWith('/graphql')) {
      gql.push({ method: req.method(), headers: req.headers(), body: req.postData() });
      if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors, body: '' });
      const r = graphql || { status: 200, body: { data: { customer: null } } };
      return req.respond({
        status: r.status, headers: cors, contentType: 'application/json',
        body: JSON.stringify(r.body),
      });
    }
    if (req.url().startsWith('http://pwa.test/')) return req.respond({ status: 200, contentType: 'text/html', body: html });
    return req.continue();
  });
  return { p, captured };
}

const events = (captured) => captured.flatMap((b) => b.events || []);
const withIdentity = (captured) => events(captured).filter((e) => {
  const q = e.properties || {};
  return q.customer_id || q.customer_name || q.email;
});


// ── Magento PWA Studio (Venia) fixtures ──────────────────────────────────────
// Reproduces the browser storage of a real Venia storefront: BrowserPersistence
// envelopes under M2_VENIA_BROWSER_PERSISTENCE__* plus a persisted Apollo cache.
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims) => `${b64url({ kid: '1', alg: 'HS256' })}.${b64url(claims)}.c2ln`;

/** A BrowserPersistence envelope: the value is stored JSON-encoded. */
const envelope = (value, ttl, ageSeconds) => JSON.stringify({
  value: JSON.stringify(value),
  timeStored: Date.now() - (ageSeconds || 0) * 1000,
  ttl: ttl === undefined ? 3600 : ttl,
});

/** Apollo cache shaped the way apollo-cache-persist writes it. */
const apolloCache = (customer) => JSON.stringify({
  ROOT_QUERY: { __typename: 'Query', customer: { __ref: 'Customer:1' }, cmsBlocks: {} },
  'Customer:1': { __typename: 'Customer', ...customer },
});

/** Seed localStorage before the tracker executes. */
const veniaShell = (entries, body) => shell(
  `<script>${Object.entries(entries).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('')}</script>`,
  body,
);
const P = 'M2_VENIA_BROWSER_PERSISTENCE__';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
try {
  // ── 1. Guest: nothing invented, and platform is 'custom' ──────────────────
  {
    const { p, captured } = await newPage(browser, shell());
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(600);
    await p.evaluate(() => window.track('custom_demo', { a: 1 }));
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
    await sleep(400);
    ok(events(captured).length > 0, 'guest: events flow on a headless shell', events(captured).length);
    ok(withIdentity(captured).length === 0, 'guest: no identity invented', withIdentity(captured).map((e) => e.properties));
    ok(await p.evaluate(() => typeof window.track.identify), 'identify() is exposed');
    ok(await p.evaluate(() => typeof window.track.reset), 'reset() is exposed');
    ok(await p.evaluate(() => typeof window.track.visitorId()), 'visitorId() returns a value');
    await p.close(); await p.__ctx.close();
  }

  // ── 2. identify() after login → transmitted immediately, no page load ─────
  {
    const { p, captured } = await newPage(browser, shell());
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(600);
    const before = events(captured).length;
    await p.evaluate(() => window.track.identify({
      id: '7412345678901', name: 'Asha Menon', email: 'asha@example.com',
    }));
    await sleep(500);
    const signal = events(captured).slice(before).find((e) => (e.properties || {}).track === 'identity_resolved');
    ok(!!signal, 'identify(): identity signal emitted at once (no further interaction)');
    ok(signal && signal.event_type === 'element_click', 'identity signal uses the whitelisted element_click type', signal && signal.event_type);
    ok(signal && signal.properties.id_probe === 'app_identify:ok', 'id_probe = app_identify:ok', signal && signal.properties.id_probe);
    ok(signal && signal.properties.customer_id === '7412345678901' &&
       signal.properties.customer_name === 'Asha Menon' &&
       signal.properties.email === 'asha@example.com', 'identity fields on the signal', signal && signal.properties);
    ok(signal && !!signal.properties.page_type, 'signal carries page_type (stays funnel-neutral)');
    ok(await p.evaluate(() => !!window.sessionStorage.getItem('__plat_cid')), '__plat_cid cached in sessionStorage');

    // Idempotence: the same payload again must not re-emit.
    const n1 = events(captured).length;
    await p.evaluate(() => { for (let i = 0; i < 5; i++) window.track.identify({ id: '7412345678901', name: 'Asha Menon', email: 'asha@example.com' }); });
    await sleep(300);
    ok(events(captured).length === n1, 'identify() is idempotent for an unchanged payload', events(captured).length - n1);

    // Every later event carries identity.
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
    await sleep(400);
    const later = events(captured).slice(n1).filter((e) => e.event_type === 'custom_demo');
    ok(later.length > 0 && later.every((e) => e.properties.customer_name === 'Asha Menon'),
      'later events all carry identity', later.map((e) => e.properties.customer_name));

    // ── 3. STICKY across the 15s probe TTL (the regression this guards) ─────
    console.log('  … waiting out the 15s identity TTL');
    await sleep(16500);
    const n2 = events(captured).length;
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { t: i }); });
    await sleep(400);
    const afterTtl = events(captured).slice(n2).filter((e) => e.event_type === 'custom_demo');
    ok(afterTtl.length > 0 && afterTtl.every((e) => e.properties.customer_name === 'Asha Menon'),
      'identity survives the 15s TTL re-probe', afterTtl.map((e) => e.properties.customer_name));

    // ── 4. SPA route change keeps identity ─────────────────────────────────
    const n3 = events(captured).length;
    await p.evaluate(() => history.pushState({}, '', '/products/widget'));
    await sleep(600);
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { r: i }); });
    await sleep(400);
    const afterNav = events(captured).slice(n3).filter((e) => (e.properties || {}).customer_name);
    ok(afterNav.length > 0, 'identity persists across an SPA route change', afterNav.length);

    // ── 5. reset() on logout ───────────────────────────────────────────────
    await p.evaluate(() => window.track.reset());
    ok(await p.evaluate(() => !window.sessionStorage.getItem('__plat_cid')), 'reset(): __plat_cid cleared');
    const n4 = events(captured).length;
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { z: i }); });
    await sleep(400);
    const afterReset = events(captured).slice(n4).filter((e) => (e.properties || {}).z !== undefined);
    ok(afterReset.length > 0 && afterReset.every((e) => !e.properties.customer_name && !e.properties.email && !e.properties.customer_id),
      'reset(): later events carry no identity', afterReset.map((e) => e.properties));

    // ── 6. A different user after reset resolves cleanly ───────────────────
    const n5 = events(captured).length;
    await p.evaluate(() => window.track.identify({ id: '99', firstName: 'Ravi', lastName: 'Kumar' }));
    await sleep(400);
    const second = events(captured).slice(n5).find((e) => (e.properties || {}).customer_name);
    ok(second && second.properties.customer_name === 'Ravi Kumar' && second.properties.customer_id === '99',
      'account switch: second user resolves (firstName/lastName joined)', second && second.properties);
    await p.close(); await p.__ctx.close();
  }

  // ── 7. Pre-load _platq queue (app knows the user before tracker.js runs) ──
  {
    const html = shell(`<script>window._platq=[['identify',{id:'555',name:'Early Bird',email:'early@example.com'}]];</script>`);
    const { p, captured } = await newPage(browser, html);
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(700);
    const q = withIdentity(captured);
    ok(q.length > 0 && q[0].properties.customer_name === 'Early Bird',
      '_platq: queued identify() drained on tracker init', q.map((e) => e.properties.customer_name));
    ok(q.some((e) => e.properties.id_probe === 'app_identify:ok'), '_platq: id_probe = app_identify:ok');
    await p.close(); await p.__ctx.close();
  }

  // ── 8. SSR global on a non-Shopify shell → global_customer:ok ─────────────
  {
    const html = shell(`<script>window.__PLAT_CUSTOMER__={id:'8123',name:'Server Rendered',email:'ssr@example.com'};</script>`);
    const { p, captured } = await newPage(browser, html);
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(3800);   // the tracker's late identity re-probe fires at 3s
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
    await sleep(400);
    const g = withIdentity(captured);
    ok(g.length > 0 && g[0].properties.customer_name === 'Server Rendered',
      '__PLAT_CUSTOMER__ read on a headless shell (first event)', g.map((e) => e.properties.customer_name));
    ok(g.some((e) => e.properties.id_probe === 'global_customer:ok'),
      'id_probe = global_customer:ok', g.map((e) => e.properties.id_probe));
    await p.close(); await p.__ctx.close();
  }

  // ── 9. Placeholder / empty values are rejected ────────────────────────────
  {
    const { p, captured } = await newPage(browser, shell());
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(600);
    await p.evaluate(() => {
      window.track.identify({ id: '{{customer.id}}', name: '{{customer.name}}', email: '' });
      window.track.identify({ id: '0' });
      window.track.identify({ id: 'null', name: 'undefined' });
      window.track.identify({});
    });
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
    await sleep(400);
    ok(withIdentity(captured).length === 0, 'placeholders/0/null rejected', withIdentity(captured).map((e) => e.properties));
    await p.close(); await p.__ctx.close();
  }

  // ── 10. Venia: signin token + Apollo customer → full identity ─────────────
  {
    const html = veniaShell({
      [P + 'signin_token']: envelope(jwt({ uid: 42, utypid: 3 }), 3600),
      [P + 'cartId']: envelope('DaDRJMqwIIdEalPZF0jG5TrmK2M0rFtL', 3600),
      'apollo-cache-persist-default': apolloCache({ firstname: 'Asha', lastname: 'Menon', email: 'asha@example.com' }),
    });
    const { p, captured } = await newPage(browser, html);
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(3800);
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
    await sleep(400);
    const v = withIdentity(captured);
    ok(v.length > 0 && v[0].properties.customer_name === 'Asha Menon' &&
       v[0].properties.email === 'asha@example.com' && v[0].properties.customer_id === '42',
      'venia: token uid + Apollo customer resolve name/email/id', v.map((e) => e.properties));
    ok(v.some((e) => e.properties.id_probe === 'pwa_venia:ok'), 'venia: id_probe = pwa_venia:ok',
      v.map((e) => e.properties.id_probe));
    ok(await p.evaluate(() => !!window.sessionStorage.getItem('__plat_pwaid')), 'venia: __plat_pwaid cached');
    const leaked = JSON.stringify(captured).indexOf('utypid') > -1;
    ok(!leaked, 'venia: the signin JWT is never transmitted');
    await p.close(); await p.__ctx.close();
  }

  // ── 11. Venia: token only (Apollo cache not yet warm) → uid alone ─────────
  {
    const html = veniaShell({ [P + 'signin_token']: envelope(jwt({ uid: 7412, utypid: 3 }), 3600) });
    const { p, captured } = await newPage(browser, html);
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(3800);
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
    await sleep(400);
    const v = withIdentity(captured);
    ok(v.length > 0 && v[0].properties.customer_id === '7412' && !v[0].properties.customer_name,
      'venia: uid alone when Apollo has no Customer yet (server resolves the name)', v.map((e) => e.properties));
    ok(v.some((e) => e.properties.id_probe === 'pwa_venia:uid'), 'venia: id_probe = pwa_venia:uid',
      v.map((e) => e.properties.id_probe));
    await p.close(); await p.__ctx.close();
  }

  // ── 12. Venia guest and expired token → nothing, but diagnosable ──────────
  {
    const html = veniaShell({ [P + 'cartId']: envelope('guest-cart', 3600) });
    const { p, captured } = await newPage(browser, html);
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(3800);
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
    await sleep(400);
    ok(withIdentity(captured).length === 0, 'venia guest: no identity', withIdentity(captured).map((e) => e.properties));
    ok(events(captured).some((e) => (e.properties || {}).id_probe === 'pwa_venia:guest'),
      'venia guest: id_probe = pwa_venia:guest',
      events(captured).map((e) => (e.properties || {}).id_probe).filter(Boolean));
    await p.close(); await p.__ctx.close();
  }
  {
    // ttl 60s, stored 600s ago → BrowserPersistence considers it expired.
    const html = veniaShell({ [P + 'signin_token']: envelope(jwt({ uid: 99 }), 60, 600) });
    const { p, captured } = await newPage(browser, html);
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(3800);
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
    await sleep(400);
    ok(withIdentity(captured).length === 0, 'venia: expired signin token ignored',
      withIdentity(captured).map((e) => e.properties));
    await p.close(); await p.__ctx.close();
  }

  // ── 13. Login mid-session, no reload, no interaction ──────────────────────
  // The real Venia case: the shopper signs in on an SPA route; nothing navigates
  // and the tab then sits idle. The periodic anonymous re-probe must notice.
  {
    const html = veniaShell({ [P + 'cartId']: envelope('guest-cart', 3600) });
    const { p, captured } = await newPage(browser, html);
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(3800);
    const before = events(captured).length;
    await p.evaluate((tok, cache) => {
      localStorage.setItem('M2_VENIA_BROWSER_PERSISTENCE__signin_token', tok);
      localStorage.setItem('apollo-cache-persist-default', cache);
    }, envelope(jwt({ uid: 555, utypid: 3 }), 3600),
       apolloCache({ firstname: 'Ravi', lastname: 'Kumar', email: 'ravi@example.com' }));
    console.log('  … idle wait for the anonymous re-probe (no events emitted)');
    await sleep(18000);
    const after = events(captured).slice(before).filter((e) => (e.properties || {}).customer_name);
    ok(after.length > 0 && after[0].properties.customer_name === 'Ravi Kumar',
      'venia: login with no navigation and no interaction is still detected',
      events(captured).slice(before).map((e) => e.event_type));
    await p.close(); await p.__ctx.close();
  }

  // ── 14. Venia: authenticated GraphQL probe resolves name + email ──────────
  // Apollo cache cold and no synced profile — the real state of a fresh
  // connector. The bearer-token customer query is the only path left.
  {
    const html = veniaShell({ [P + 'signin_token']: envelope(jwt({ uid: 314, utypid: 3 }), 3600) });
    const { p, captured } = await newPage(browser, html, {
      status: 200,
      body: { data: { customer: { firstname: 'Asha', lastname: 'Menon', email: 'asha@example.com' } } },
    });
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
    await sleep(500);
    const v = withIdentity(captured);
    ok(v.some((e) => e.properties.customer_name === 'Asha Menon' && e.properties.email === 'asha@example.com'),
      'gql: customer query resolves name + email', v.map((e) => e.properties.customer_name));
    ok(v.some((e) => e.properties.customer_id === '314'), 'gql: JWT uid kept alongside the queried name',
      v.map((e) => e.properties.customer_id));
    ok(v.some((e) => e.properties.id_probe === 'pwa_gql:ok'), 'gql: id_probe = pwa_gql:ok',
      v.map((e) => e.properties.id_probe));

    const req = p.__gql.find((r) => r.method === 'POST');
    ok(!!req && /^Bearer eyJ/.test(req.headers.authorization || ''), 'gql: bearer token sent in Authorization',
      req && req.headers.authorization && req.headers.authorization.slice(0, 20));
    ok(!!req && req.body.indexOf('customer{firstname lastname email}') > -1, 'gql: minimal customer query', req && req.body);
    ok(p.__gql.filter((r) => r.method === 'POST').length === 1, 'gql: queried once, not per page view',
      p.__gql.filter((r) => r.method === 'POST').length);
    ok(JSON.stringify(captured).indexOf('Bearer') === -1 && JSON.stringify(captured).indexOf('utypid') === -1,
      'gql: the token never reaches our ingest');
    await p.close(); await p.__ctx.close();
  }

  // ── 15. Expired/revoked token: Magento reports it INSIDE a 200 ────────────
  {
    const html = veniaShell({ [P + 'signin_token']: envelope(jwt({ uid: 900 }), 3600) });
    const { p, captured } = await newPage(browser, html, {
      status: 200,
      body: { errors: [{ message: "The current customer isn't authorized." }], data: { customer: null } },
    });
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
    await sleep(500);
    const named = events(captured).filter((e) => (e.properties || {}).customer_name || (e.properties || {}).email);
    ok(named.length === 0, 'gql: errors[] in a 200 is treated as failure, not as an identity',
      named.map((e) => e.properties));
    ok(events(captured).some((e) => (e.properties || {}).id_probe === 'pwa_gql:unauth'),
      'gql: id_probe = pwa_gql:unauth',
      events(captured).map((e) => (e.properties || {}).id_probe).filter(Boolean));
    await p.close(); await p.__ctx.close();
  }

  // ── 16. The probe must not masquerade as storefront traffic ───────────────
  // patchNetwork() instruments window.fetch for add-to-cart detection and RUM
  // network errors; our own probe goes through the pre-patch native fetch.
  {
    const html = veniaShell({ [P + 'signin_token']: envelope(jwt({ uid: 77 }), 3600) });
    const { p, captured } = await newPage(browser, html, { status: 500, body: { errors: [{ message: 'boom' }] } });
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
    await sleep(500);
    const types = events(captured).map((e) => e.event_type);
    ok(!types.includes('add_to_cart'), 'gql: probe never counted as an add_to_cart', types);
    ok(events(captured).some((e) => String((e.properties || {}).id_probe || '').indexOf('pwa_gql:http_500') === 0),
      'gql: HTTP failure recorded as pwa_gql:http_500',
      events(captured).map((e) => (e.properties || {}).id_probe).filter(Boolean));
    await p.close(); await p.__ctx.close();
  }

  // ── 17. Guest: no token → no GraphQL call at all ──────────────────────────
  {
    const html = veniaShell({ [P + 'cartId']: envelope('guest-cart', 3600) });
    const { p } = await newPage(browser, html, {
      status: 200, body: { data: { customer: { firstname: 'Should', lastname: 'NotHappen' } } },
    });
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    ok(p.__gql.filter((r) => r.method === 'POST').length === 0, 'gql: guests are never queried',
      p.__gql.length);
    await p.close(); await p.__ctx.close();
  }

  // ── 18. Apollo cache already warm → no network call needed ────────────────
  {
    const html = veniaShell({
      [P + 'signin_token']: envelope(jwt({ uid: 42 }), 3600),
      'apollo-cache-persist-default': apolloCache({ firstname: 'Ravi', lastname: 'Kumar', email: 'ravi@example.com' }),
    });
    const { p, captured } = await newPage(browser, html, {
      status: 200, body: { data: { customer: { firstname: 'Should', lastname: 'NotHappen' } } },
    });
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { i }); });
    await sleep(500);
    ok(p.__gql.filter((r) => r.method === 'POST').length === 0,
      'gql: skipped when the Apollo cache already answered', p.__gql.length);
    ok(withIdentity(captured).some((e) => e.properties.customer_name === 'Ravi Kumar'),
      'gql: Apollo-sourced name still wins', withIdentity(captured).map((e) => e.properties.customer_name));
    await p.close(); await p.__ctx.close();
  }

  // ── 19. Venia sign-out invalidates the cached identity ───────────────────
  // Venia's sign-out deletes signin_token. A store that never integrated
  // identify() cannot call reset(), so the token IS the sign-out signal.
  {
    const html = veniaShell({
      [P + 'signin_token']: envelope(jwt({ uid: 21 }), 3600),
      'apollo-cache-persist-default': apolloCache({ firstname: 'Meera', lastname: 'Iyer', email: 'meera@example.com' }),
    });
    const { p, captured } = await newPage(browser, html);
    await p.goto('http://pwa.test/', { waitUntil: 'domcontentloaded' });
    await sleep(3800);
    ok(await p.evaluate(() => !!sessionStorage.getItem('__plat_pwaid')), 'signout: identity cached while signed in');

    await p.evaluate(() => {
      localStorage.removeItem('M2_VENIA_BROWSER_PERSISTENCE__signin_token');
      localStorage.removeItem('apollo-cache-persist-default');
      localStorage.setItem('M2_VENIA_BROWSER_PERSISTENCE__cartId', JSON.stringify({ value: '"guest"', timeStored: 1, ttl: 99999 }));
    });
    await sleep(16500);   // outlast the identity TTL so the probes re-run
    const n = events(captured).length;
    await p.evaluate(() => { for (let i = 0; i < 10; i++) window.track('custom_demo', { z: i }); });
    await sleep(500);
    const after = events(captured).slice(n).filter((e) => (e.properties || {}).z !== undefined);
    ok(after.length > 0 && after.every((e) => !e.properties.customer_name && !e.properties.email),
      'signout: later events carry no identity', after.map((e) => e.properties));
    ok(await p.evaluate(() => !sessionStorage.getItem('__plat_pwaid')), 'signout: __plat_pwaid invalidated');
    await p.close(); await p.__ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
