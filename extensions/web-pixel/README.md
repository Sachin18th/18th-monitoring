# KPI Monitoring — Shopify Web Pixel extension

This is the **code Shopify actually runs** for the pixel that the backend
registers via `webPixelCreate`
(`packages/connectors/src/commerce/shopify-pixel.service.ts`).

`webPixelCreate` registers an **app-owned** web pixel — Shopify executes the
deployed extension bundle, **not** a script string. The `settings` passed at
registration (`ingestUrl`, `connectorInstanceId`, `projectId`) are delivered to
`src/index.js` via `api.settings` and must match the schema in
`shopify.extension.toml`.

## Deploy

This extension must be deployed from a **Shopify app** (it needs a
`shopify.app.toml` + app credentials). This monorepo is the backend platform and
has no Shopify app, so either:

1. Add a `shopify.app.toml` at the repo root and run from here, **or**
2. Copy this `extensions/web-pixel/` folder into your existing Shopify app repo.

Then:

```bash
npm install            # pulls @shopify/web-pixels-extension
shopify app deploy     # bundles + publishes the extension to your app
```

Only after a successful `shopify app deploy` will `webPixelCreate` have code to
run. Until then the pixel registers but does nothing.

## Event contract

`src/index.js` posts to `POST {ingestUrl}` in the exact shape
`StorefrontTrackingService.ingestBatch` expects: an `events: [...]` array with
canonical `event_type`s (`checkout_step` / `checkout_complete`) plus
`session_id` (checkout token) and `visitor_id` (pixel `clientId`). Changing the
ingest contract means updating this file too.
