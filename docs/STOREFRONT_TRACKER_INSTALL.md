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

## Verifying the install

After loading the storefront, confirm events are arriving:

```
GET API_HOST/api/track/events?connector_instance_id=CONNECTOR_ID&limit=1
```

(analyst role or higher). A non-empty `events` array means the tracker is live.
The dashboard's **Verify Installation** button calls exactly this.
