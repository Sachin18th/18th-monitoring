/**
 * Translates raw Adobe Commerce (Magento) REST error bodies into clear, actionable
 * messages — most importantly the 401 "consumer isn't authorized to access %resources"
 * response, which is an ACL grant problem on the store, not an app bug.
 *
 * Magento returns, e.g.:
 *   { "message": "The consumer isn't authorized to access %resources.",
 *     "parameters": { "resources": "Magento_Sales::actions_view" } }
 */

// Maps known Magento ACL resource identifiers to the admin menu path that grants them.
const RESOURCE_GUIDANCE: Record<string, string> = {
  'Magento_Sales::actions_view': "Sales → Operations → Orders (view)",
  'Magento_Sales::sales': "Sales",
  'Magento_Customer::manage': "Customers → All Customers",
  'Magento_Customer::customer': "Customers",
};

/**
 * Given an HTTP status and raw response body, returns a human-actionable error
 * message. Falls back to the raw body for anything that isn't a recognized
 * authorization failure.
 */
export const interpretAdobeApiError = (status: number, body: string, statusText = ''): string => {
  const raw = body || statusText || '';

  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // not JSON — fall through to the generic message
  }

  const message = String(parsed?.message || '');
  const isAuthorizationDenial =
    status === 401 &&
    (message.includes("isn't authorized to access") || message.includes('%resources'));

  if (isAuthorizationDenial) {
    const resource = String(parsed?.parameters?.resources || '').trim();
    const where = RESOURCE_GUIDANCE[resource];
    const resourceLabel = where
      ? `"${where}" (${resource})`
      : resource
        ? `the "${resource}" resource`
        : 'the required API resource';

    return (
      `Adobe Commerce denied access: your integration/admin token is missing ${resourceLabel}. ` +
      `In Magento Admin → System → Extensions → Integrations, edit this integration, grant the resource under the ` +
      `API tab (or set Resource Access to "All"), Save, then click Reauthorize — the token's scope only updates ` +
      `after reauthorization. If you used an admin user token instead of an integration, grant the resource to that ` +
      `user's role under System → Permissions → User Roles. Then resync.`
    );
  }

  return `Adobe Commerce API request failed (${status}): ${raw}`;
};
