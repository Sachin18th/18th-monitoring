# Storefront Tracker — Install Guide (Deliverable 4)

Exact embed snippets and admin step-by-step instructions for installing the
storefront session/event tracker on **Shopify**, **BigCommerce**, and
**Adobe Commerce (Magento 2)**.

## Substitution tokens

Every snippet below uses placeholder tokens. Replace them before installing
(the dashboard's **Install** card does this substitution for you automatically):

| Token            | Replace with                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `CONNECTOR_ID`   | The connector instance id for the store (a UUID, e.g. `8f3c…`).      |
| `API_HOST`       | Your **public** platform API host, e.g. `https://api.yourdomain.com`. Never `localhost` — a live storefront cannot reach it. |

The canonical tag is always:

```html
<script src="API_HOST/api/track/tracker.js"
        data-connector-id="CONNECTOR_ID"
        data-ingest-url="API_HOST/api/track"
        async></script>
```

- `data-connector-id` — identifies the store; the ingest validates it and derives the tenant.
- `data-ingest-url` — the `POST` endpoint the batched events are sent to.
- The script is `async`, zero-dependency, ~3.2 KB gzipped, and silent-fails — it never blocks page render.

> One connector id per store / store view. Re-using a single id across multiple
> storefronts will merge their sessions and funnels.

---

## 1. Shopify

### Method A — `theme.liquid` (fastest, no app required)

1. Shopify admin → **Online Store** → **Themes**.
2. On your live theme, click **⋯ (Actions)** → **Edit code**.
3. Under **Layout**, open **`theme.liquid`**.
4. Paste the snippet **immediately before the closing `</head>`** tag:

   ```html
   <script src="API_HOST/api/track/tracker.js"
           data-connector-id="CONNECTOR_ID"
           data-ingest-url="API_HOST/api/track"
           async></script>
   ```

5. Click **Save**. Open your storefront and navigate a couple of pages to emit events.

> On Shopify, the native checkout (`checkout.shopify.com`) runs on Shopify-owned
> pages where custom `<head>` scripts are **not** injected unless you are on
> **Shopify Plus** (checkout extensibility). `page_view`, `product_view`, and
> `element_click` still capture across the storefront; `checkout_step` /
> `checkout_complete` fire on the cart and the post-purchase **Thank You /
> order-status** page, which the script does see.

### Method B — Theme App Extension (App Embed Block)

For distribution as an app embed (merchant toggles it on, no code edits). Add a
block to your theme-app-extension under `extensions/<name>/blocks/tracker.liquid`:

```liquid
<script src="{{ block.settings.api_host }}/api/track/tracker.js"
        data-connector-id="{{ block.settings.connector_id }}"
        data-ingest-url="{{ block.settings.api_host }}/api/track"
        async></script>

{% schema %}
{
  "name": "Storefront Tracker",
  "target": "head",
  "settings": [
    {
      "type": "text",
      "id": "connector_id",
      "label": "Connector ID",
      "default": "CONNECTOR_ID"
    },
    {
      "type": "text",
      "id": "api_host",
      "label": "API Host",
      "default": "API_HOST"
    }
  ]
}
{% endschema %}
```

Merchant steps: **Online Store** → **Themes** → **Customize** → **App embeds**
(bottom-left) → enable **Storefront Tracker** → fill in **Connector ID** and
**API Host** → **Save**. The `"target": "head"` places the script in `<head>` on
every page automatically.

---

## 2. BigCommerce — Script Manager

1. BigCommerce admin → **Storefront** → **Script Manager**.
2. Click **Create a Script**.
3. Fill in **exactly** these field values:

   | Field                                | Value                                                |
   | ------------------------------------ | ---------------------------------------------------- |
   | **Name of script**                   | `Storefront Tracker`                                 |
   | **Description**                      | `Session & funnel event capture`                     |
   | **Location on page**                 | `Head`                                               |
   | **Select pages where script will be added** | `All pages`                                   |
   | **Script category**                  | `Essential`                                          |
   | **Script type**                      | `Script`                                             |

4. In the **Script contents** box, paste:

   ```html
   <script src="API_HOST/api/track/tracker.js"
           data-connector-id="CONNECTOR_ID"
           data-ingest-url="API_HOST/api/track"
           async></script>
   ```

5. Click **Save**. Script Manager injects this into `<head>` on all storefront
   pages, including the optimized one-page checkout and the order-confirmation
   page (so `checkout_step` and `checkout_complete` fire).

> Choosing **Essential** (rather than a consent-gated category) ensures the
> first-party, cookieless tracker loads before any consent banner defers it.

---

## 3. Adobe Commerce (Magento 2)

### Method A — Full custom module (recommended for developers)

Create `app/code/Vendor/StorefrontTracker/` with the four files below, then run
the CLI commands.

**`registration.php`**

```php
<?php
use Magento\Framework\Component\ComponentRegistrar;

ComponentRegistrar::register(
    ComponentRegistrar::MODULE,
    'Vendor_StorefrontTracker',
    __DIR__
);
```

**`etc/module.xml`**

```xml
<?xml version="1.0"?>
<config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:noNamespaceSchemaLocation="urn:magento:framework:Module/etc/module.xsd">
    <module name="Vendor_StorefrontTracker" setup_version="1.0.0"/>
</config>
```

**`view/frontend/layout/default_head_blocks.xml`** — injects a template block
into the document head on every frontend page (a plain `<script src>` head entry
cannot carry the `data-*` attributes, so we use a template block):

```xml
<?xml version="1.0"?>
<page xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="urn:magento:framework:View/Layout/etc/page_configuration.xsd">
    <head>
        <block class="Magento\Framework\View\Element\Template"
               name="storefront_tracker"
               template="Vendor_StorefrontTracker::tracker.phtml"/>
    </head>
</page>
```

**`view/frontend/templates/tracker.phtml`**

```php
<script src="API_HOST/api/track/tracker.js"
        data-connector-id="CONNECTOR_ID"
        data-ingest-url="API_HOST/api/track"
        async></script>
```

**CLI commands** (from the Magento root):

```bash
bin/magento module:enable Vendor_StorefrontTracker
bin/magento setup:upgrade
bin/magento setup:di:compile          # production mode only
bin/magento setup:static-content:deploy   # production mode only
bin/magento cache:flush
```

### Method B — Admin CMS injection (no developer / no deploy)

1. Admin → **Content** → **Design** → **Configuration**.
2. Find the row for the **store view** you want to track and click **Edit**.
3. Expand **HTML Head** → **Scripts and Style Sheets**.
4. Paste the snippet into that field:

   ```html
   <script src="API_HOST/api/track/tracker.js"
           data-connector-id="CONNECTOR_ID"
           data-ingest-url="API_HOST/api/track"
           async></script>
   ```

5. Click **Save Configuration**, then **System** → **Cache Management** →
   **Flush Magento Cache**.

   *(Equivalent path: **Stores** → **Configuration** → **General** → **Design** →
   **HTML Head** → "Scripts and Style Sheets". Set the scope selector to the
   specific store view first — see the multi-store note.)*

### Method C — REST config API (programmatic, no module deploy)

Write the snippet into the `design/head/includes` config value (the same
"Scripts and Style Sheets" head field as Method B) over the API, using an admin
access token. This is what the dashboard's **Install** button uses for Adobe
Commerce (`POST /api/track/install`).

> **Heads-up — what's actually possible:** stock **Magento Open Source has no
> native REST endpoint that writes `core_config_data`**, and the admin-token
> endpoint is gated by mandatory **2FA on 2.4+**. So a pure "REST config write,
> no module" works only when the instance exposes a config-write endpoint
> (Adobe Commerce setups, or a thin admin integration that maps one call to a
> config write). When it isn't available, the install call returns
> `manual_required` with the exact CLI/admin steps — it never silently fails.

**Connector config** (`connector_instances.syncConfig`):

| Key                    | Value                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| `baseUrl`              | Store base URL, e.g. `https://store.example.com`                  |
| `storeViewCode`        | Store view code to scope to (omit for global/default scope)       |
| `adobeConfigEndpoint`  | Path (or absolute URL) of the config-write endpoint, e.g. `/rest/V1/config-set` |

**Credentials** (`connector_credentials.encryptedSecret`, JSON): either an
`accessToken` / `integrationToken` (an **Integration** access token — not
subject to 2FA, recommended), or `adminUser` + `adminPassword` (exchanged at
`POST /rest/V1/integration/admin/token`; blocked by 2FA on 2.4+).

**Request the service makes** (admin bearer token):

```
POST {baseUrl}{adobeConfigEndpoint}
Authorization: Bearer <admin/integration token>
Content-Type: application/json

{
  "path":  "design/head/includes",
  "value": "<!-- storefront-tracker:start -->\n<script src=\"API_HOST/api/track/tracker.js\" data-connector-id=\"CONNECTOR_ID\" data-ingest-url=\"API_HOST/api/track\" async></script>\n<!-- storefront-tracker:end -->",
  "scope": "stores",          // or "default" when no store view code
  "scopeCode": "<storeViewCode>",
  "marker": { "start": "<!-- storefront-tracker:start -->", "end": "<!-- storefront-tracker:end -->" }
}
```

The `marker` lets an append-safe endpoint replace **only** the tracker block
rather than overwrite any existing head HTML. The endpoint's job is simply to
write `design/head/includes` at the given scope.

**Guaranteed equivalents** (when no endpoint is available):

```bash
# CLI (store-view scoped):
bin/magento config:set --scope=stores --scope-code=<storeViewCode> \
  design/head/includes '<script src="API_HOST/api/track/tracker.js" data-connector-id="CONNECTOR_ID" data-ingest-url="API_HOST/api/track" async></script>'
bin/magento cache:flush
```

…or paste the snippet in Admin → **Content** → **Design** → **Configuration**
→ (store view row) → **HTML Head** → **Scripts and Style Sheets** (Method B).

### ⚠️ Multi-store note (Adobe Commerce)

A single Adobe Commerce installation can serve **multiple websites / store
views**, and **each store view should report to its own `CONNECTOR_ID`** so
sessions and funnels don't merge across brands or locales.

- **Method B:** the **Design Configuration** grid is scoped per store view —
  edit each store view's row separately and paste that store view's own
  `CONNECTOR_ID`. If you instead use **Stores → Configuration**, change the
  **scope selector** (top-left) from *Default Config* to the target **Store
  View** before pasting, so the value is saved at store-view scope and not
  inherited globally.
- **Method A:** make `tracker.phtml` resolve the id per store view instead of
  hard-coding it — e.g. read it from a store-scoped config value
  (`$block->_scopeConfig->getValue('storefront_tracker/general/connector_id', \Magento\Store\Model\ScopeInterface::SCOPE_STORE)`)
  set per store view under **Stores → Configuration**. One module, one
  `CONNECTOR_ID` per store view.
- Map exactly **one connector instance ⇆ one store view** in the dashboard.

---

## 4. Headless front-ends & PWAs (`window.track.identify`)

On Shopify / BigCommerce / Adobe the tracker resolves the logged-in shopper by
reading what the platform itself exposes (`mage-cache-storage`,
`ShopifyAnalytics`, `window.customer`, the section-load / cart endpoints). A
**headless storefront or PWA exposes none of those**, and it is usually on its
own origin, so the platform's session cookie is unreachable too — every probe in
`identityInfo()` is a no-op there and sessions arrive anonymous.

The app itself is the only source of truth, so it pushes identity in:

```js
window.track.identify({ id, name, email });  // login, and on restored-session boot
window.track.reset();                        // logout / account switch
window.track.visitorId();                    // for an optional server-to-server link
```

### Step 1 — the tag

```html
<!-- Pre-load queue: identify() may be called before the async tracker executes -->
<script>window._platq = window._platq || [];</script>

<script src="API_HOST/api/track/tracker.js"
        data-connector-id="CONNECTOR_ID"
        data-ingest-url="API_HOST/api/track"
        async></script>
```

Next.js App Router: render the first as `<Script id="platq" strategy="beforeInteractive">`,
the second as `<Script strategy="afterInteractive">`.

### Step 2 — a small wrapper in the app

```js
// src/lib/platTracker.js
const queue = (call) => { window._platq = window._platq || []; window._platq.push(call); };

function clean(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (!s || s === '0' || s === 'null' || s === 'undefined') return '';
  return s.indexOf('{{') > -1 ? '' : s;
}

/** Tell the tracker who is logged in. Safe to call on every render — repeat
 *  payloads are ignored by the tracker. */
export function identify(user) {
  if (typeof window === 'undefined' || !user) return;
  const payload = {
    // The PLATFORM's customer id (Shopify / BigCommerce / Magento), NOT an
    // internal app id — see "Which id to send" below.
    id: clean(user.id),
    name: clean(user.name) || [clean(user.firstName), clean(user.lastName)].filter(Boolean).join(' '),
    email: clean(user.email),
  };
  if (!payload.id && !payload.name && !payload.email) return;
  if (window.track && window.track.identify) window.track.identify(payload);
  else queue(['identify', payload]);          // tracker not loaded yet
}

/** Clear identity on logout. Stale identity is worse than none: a long-lived PWA
 *  tab would otherwise label the next user's sessions with the previous user. */
export function reset() {
  if (typeof window === 'undefined') return;
  if (window.track && window.track.reset) window.track.reset();
  else queue(['reset']);
}

/** Optional custom events (already supported on every platform). */
export function track(type, props) {
  if (typeof window === 'undefined') return;
  if (window.track) window.track(type, props || {});
  else queue([type, props || {}]);
}
```

### Step 3 — wire it to auth state

```jsx
// Mount once, high in the tree.
'use client';
import { useEffect } from 'react';
import { identify, reset } from '@/lib/platTracker';
import { useAuth } from '@/context/AuthContext';

export default function TrackerIdentity() {
  const { user } = useAuth();               // null while logged out / restoring
  useEffect(() => {
    if (user) identify({ id: user.shopifyCustomerId, name: user.fullName, email: user.email });
    else reset();
  }, [user]);
  return null;
}
```

One effect covers login, logout **and** cold-start token rehydration — all three
are just changes to `user`. That last case matters most in a PWA: the app resumes
already logged in, with no login event to hook.

Vue: `watch(user, u => u ? identify({...}) : reset(), { immediate: true })`.
Vanilla: call `identify()` in the login success handler **and** wherever a session
is restored from storage; `reset()` in the logout handler.

### Magento PWA Studio / Venia — resolves automatically

A Venia storefront needs **no app change**. It is invisible to the normal Adobe
probes (no `window.Magento`, no Magento body classes, no `mage-cache-storage`,
and `/customer/section/load/` is unreachable because Venia runs on its own origin
and authenticates with a bearer JWT), so the tracker reads what Venia actually
persists in `localStorage`:

| Source | Yields |
| ------ | ------ |
| `apollo-cache-persist-default` | the `Customer` entity → `firstname`/`lastname`/`email`, free, no network call (`id_probe=pwa_venia:ok`) |
| **authenticated GraphQL** — `POST /graphql` with `Authorization: Bearer <signin_token>` and `{customer{firstname lastname email}}` | the authoritative name + email whenever the shopper is signed in (`id_probe=pwa_gql:ok`). Fired only when the cache above came up empty, at most once per minute, aborted after 3s. The token goes only to the store's own endpoint and never to our ingest; cookies are omitted. |
| `M2_VENIA_BROWSER_PERSISTENCE__signin_token` | the JWT's `uid` → the Magento customer entity id (`id_probe=pwa_venia:uid`), used as the last resort and as the `customer_id` alongside the two above. An expired envelope (`timeStored`+`ttl`) is ignored. |

The GraphQL endpoint defaults to a relative `/graphql`, which is same-origin on a
Venia/UPWARD deployment. A build whose browser talks straight to the Magento
backend origin can override it with `data-graphql-url` on the tracker tag — but
that backend then needs CORS, otherwise the probe fails silently and the uid path
applies. Magento reports an expired or revoked token *inside* a 200 response
(`errors[]`), which is treated as a failure (`pwa_gql:unauth`), never as an empty
identity.

With the uid alone, name/email are resolved server-side against
`customer_profiles.external_ids->>'adobe_commerce'` — so **the Adobe customer
sync must have run for that shopper**. If it hasn't, or if the Apollo cache is
cold, call `identify()` from Venia's `useUserContext()` for an authoritative
answer:

```js
const [{ currentUser, isSignedIn }] = useUserContext();
useEffect(() => {
  if (isSignedIn && currentUser?.email) {
    identify({ id: currentUser.id, name: `${currentUser.firstname} ${currentUser.lastname}`, email: currentUser.email });
  } else if (!isSignedIn) {
    reset();
  }
}, [isSignedIn, currentUser]);
```

A sign-in on a Venia SPA route triggers no navigation, so while the shopper is
anonymous the tracker re-probes every flush tick (identity probes are rate-limited
to one per 15s and stop entirely once identity resolves) — an idle post-login tab
is still picked up.

### Alternative — server-rendered global (SSR shells)

If your front-end renders its own HTML shell, you can also expose the shopper
before any JS runs. It lands on the **first** event of the page, ahead of
hydration, and is read on every platform:

```html
<script>window.__PLAT_CUSTOMER__ = { id: 8123, name: "Asha Menon", email: "asha@example.com" };</script>
```

A merchant-placed `<div id="__plat_customer" data-customer-id data-customer-name
data-customer-email hidden>` works identically. Both are fallbacks — they cannot
react to a login or a logout that happens without a page load, so an app with a
client-side auth flow should still call `identify()`/`reset()`.

### Which id to send

| Backing platform | Pass as `id`                                                    |
| ---------------- | --------------------------------------------------------------- |
| Shopify          | numeric `customer.id` (strip the `gid://shopify/Customer/` prefix) |
| BigCommerce      | `customer.id` from the Customers API                             |
| Adobe Commerce   | the customer `entity_id`                                         |

The backend resolves this against the synced
`customer_profiles.external_ids`, so name/email are recovered server-side even if
this beacon never lands. Sending `email` too gives a second, independent match key
(`email_hash`). An internal app UUID matches nothing — the identity would then
depend entirely on the client payload surviving the network.

### Service worker

The SW must never cache the tracker or the ingest, or your users keep executing an
old build after a deploy:

```js
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/track') || url.pathname.startsWith('/api/rum')) return; // network only
  // …existing caching…
});
```

Workbox: a `NetworkOnly` route for `/\/api\/(track|rum)/`, and exclude
`tracker.js` from precaching.

### Verifying

1. Log in → DevTools → Network → `POST /api/track` containing an `element_click`
   event with `properties.track = "identity_resolved"` and
   `id_probe = "app_identify:ok"` (or `"global_customer:ok"` for the SSR global),
   carrying `customer_id` / `customer_name` / `email`.
2. Console: `sessionStorage.__plat_cid` is populated; empty after logout.
3. Dashboard → Session Journeys: the session shows the shopper's name.

Automated coverage: `node apps/api/src/public/tracker.identity.smoke.mjs`.

---

## Verifying the install

After loading the storefront, confirm events are arriving:

```
GET API_HOST/api/track/events?connector_instance_id=CONNECTOR_ID&limit=1
```

(analyst role or higher). A non-empty `events` array means the tracker is live.
The dashboard's **Verify Installation** button calls exactly this.
