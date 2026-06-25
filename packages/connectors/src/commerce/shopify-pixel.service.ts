/**
 * Shopify Web Pixel registration service.
 *
 * Programmatically registers (and tears down / verifies) a Shopify Web Pixel
 * on a connected store via the GraphQL Admin API. The registered pixel runs in
 * Shopify's pixel sandbox and forwards checkout events to the platform ingest
 * endpoint (POST /api/track) so they flow into the existing pipeline.
 *
 * Uses native fetch only. No third-party dependencies. Never throws — every
 * function returns a result object describing success/failure.
 */

const SHOPIFY_API_VERSION = '2024-01';

/**
 * Build the vanilla-JS pixel script that Shopify will execute in its pixel
 * sandbox. The returned string references `analytics.subscribe` (provided by
 * the Shopify pixel runtime) and posts each checkout event to the ingest URL.
 */
export function generatePixelScript(
    projectId: string,
    connectorInstanceId: string,
    ingestUrl: string
): string {
    return `
const ENDPOINT = ${JSON.stringify(ingestUrl)};
const PROJECT_ID = ${JSON.stringify(projectId)};
const CONNECTOR_ID = ${JSON.stringify(connectorInstanceId)};

function sendEvent(type, data) {
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project_id: PROJECT_ID,
      connector_instance_id: CONNECTOR_ID,
      platform: "shopify",
      source: "web_pixel",
      type: type,
      timestamp: new Date().toISOString(),
      data: data
    }),
    keepalive: true
  }).catch(() => {});
}

analytics.subscribe("checkout_started", (event) => {
  const checkout = (event.data && event.data.checkout) || {};
  sendEvent("checkout_started", {
    checkout_token: checkout.token,
    total_price: checkout.totalPrice,
    currency: checkout.currencyCode,
    line_item_count: checkout.lineItems ? checkout.lineItems.length : 0
  });
});

analytics.subscribe("checkout_contact_info_submitted", (event) => {
  const checkout = (event.data && event.data.checkout) || {};
  sendEvent("checkout_contact_info_submitted", {
    step: "contact_info",
    checkout_token: checkout.token
  });
});

analytics.subscribe("checkout_address_info_submitted", (event) => {
  const checkout = (event.data && event.data.checkout) || {};
  sendEvent("checkout_address_info_submitted", {
    step: "address_info",
    checkout_token: checkout.token
  });
});

analytics.subscribe("checkout_shipping_info_submitted", (event) => {
  const checkout = (event.data && event.data.checkout) || {};
  sendEvent("checkout_shipping_info_submitted", {
    step: "shipping_info",
    checkout_token: checkout.token,
    shipping_method: checkout.shippingLine && checkout.shippingLine.title
  });
});

analytics.subscribe("payment_info_submitted", (event) => {
  const checkout = (event.data && event.data.checkout) || {};
  sendEvent("payment_info_submitted", {
    step: "payment_info",
    checkout_token: checkout.token
  });
});

analytics.subscribe("checkout_completed", (event) => {
  const checkout = (event.data && event.data.checkout) || {};
  const order = checkout.order || {};
  sendEvent("checkout_completed", {
    order_id: order.id,
    order_number: order.number,
    total_price: checkout.totalPrice,
    currency: checkout.currencyCode,
    checkout_token: checkout.token,
    line_item_count: checkout.lineItems ? checkout.lineItems.length : 0
  });
});
`.trim();
}

/**
 * Register a Web Pixel on the store via webPixelCreate. Returns the new pixel
 * id on success. Never throws.
 */
export async function registerShopifyPixel(
    shopDomain: string,
    accessToken: string,
    projectId: string,
    connectorInstanceId: string,
    ingestUrl: string
): Promise<{ success: boolean; pixelId: string | null; error: string | null }> {
    try {
        const script = generatePixelScript(projectId, connectorInstanceId, ingestUrl);
        const settings = JSON.stringify({ script, projectId, connectorInstanceId });

        const mutation = `
mutation webPixelCreate($webPixel: WebPixelInput!) {
  webPixelCreate(webPixel: $webPixel) {
    webPixel { id settings }
    userErrors { field message }
  }
}`;

        const response = await fetch(
            `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken
                },
                body: JSON.stringify({
                    query: mutation,
                    variables: { webPixel: { settings } }
                })
            }
        );

        if (!response.ok) {
            return { success: false, pixelId: null, error: `Shopify API responded with HTTP ${response.status}` };
        }

        const body: any = await response.json();

        if (body.errors && body.errors.length) {
            return { success: false, pixelId: null, error: body.errors.map((e: any) => e.message).join('; ') };
        }

        const result = body?.data?.webPixelCreate;
        const userErrors = result?.userErrors || [];
        if (userErrors.length) {
            return { success: false, pixelId: null, error: userErrors.map((e: any) => e.message).join('; ') };
        }

        const pixelId = result?.webPixel?.id || null;
        if (!pixelId) {
            return { success: false, pixelId: null, error: 'Shopify did not return a pixel id.' };
        }

        return { success: true, pixelId, error: null };
    } catch (err: any) {
        console.error('[ShopifyPixel] registerShopifyPixel failed', err?.message || err);
        return { success: false, pixelId: null, error: err?.message || 'Unknown error registering pixel.' };
    }
}

/**
 * Delete a previously-registered Web Pixel via webPixelDelete. Never throws.
 */
export async function deregisterShopifyPixel(
    shopDomain: string,
    accessToken: string,
    pixelId: string
): Promise<{ success: boolean; error: string | null }> {
    try {
        const mutation = `
mutation webPixelDelete($id: ID!) {
  webPixelDelete(id: $id) {
    deletedWebPixelId
    userErrors { field message }
  }
}`;

        const response = await fetch(
            `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken
                },
                body: JSON.stringify({
                    query: mutation,
                    variables: { id: pixelId }
                })
            }
        );

        if (!response.ok) {
            return { success: false, error: `Shopify API responded with HTTP ${response.status}` };
        }

        const body: any = await response.json();

        if (body.errors && body.errors.length) {
            return { success: false, error: body.errors.map((e: any) => e.message).join('; ') };
        }

        const userErrors = body?.data?.webPixelDelete?.userErrors || [];
        if (userErrors.length) {
            return { success: false, error: userErrors.map((e: any) => e.message).join('; ') };
        }

        return { success: true, error: null };
    } catch (err: any) {
        console.error('[ShopifyPixel] deregisterShopifyPixel failed', err?.message || err);
        return { success: false, error: err?.message || 'Unknown error deleting pixel.' };
    }
}

/**
 * Check whether a Web Pixel still exists on the store. Returns exists:false on
 * any failure (best-effort health probe). Never throws.
 */
export async function verifyShopifyPixelExists(
    shopDomain: string,
    accessToken: string,
    pixelId: string
): Promise<{ exists: boolean; error: string | null }> {
    try {
        const query = `
query webPixelCheck($id: ID!) {
  webPixel(id: $id) {
    id
    settings
  }
}`;

        const response = await fetch(
            `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken
                },
                body: JSON.stringify({
                    query,
                    variables: { id: pixelId }
                })
            }
        );

        if (!response.ok) {
            return { exists: false, error: `Shopify API responded with HTTP ${response.status}` };
        }

        const body: any = await response.json();

        if (body.errors && body.errors.length) {
            return { exists: false, error: body.errors.map((e: any) => e.message).join('; ') };
        }

        const exists = body?.data?.webPixel != null;
        return { exists, error: null };
    } catch (err: any) {
        console.error('[ShopifyPixel] verifyShopifyPixelExists failed', err?.message || err);
        return { exists: false, error: err?.message || 'Unknown error verifying pixel.' };
    }
}
