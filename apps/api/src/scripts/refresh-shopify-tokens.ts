/**
 * Standalone Shopify token-refresh runner.
 *   npm --workspace @kpi-platform/api run refresh:shopify-tokens
 *
 * Re-exchanges the client-credentials grant for every Shopify connector whose
 * Admin API token is missing/expiring, updates the encrypted credential, and
 * emails a summary. The API server also runs this on an hourly loop
 * (ShopifyTokenService.start); this script is for manual/cron invocation.
 */
import '../config/env';
import { ShopifyTokenService } from '../services/shopify-token.service';

(async () => {
  const summary = await ShopifyTokenService.refreshExpiring();
  console.log(`[refresh-shopify-tokens] done — refreshed ${summary.refreshed}, skipped ${summary.skipped}, failed ${summary.failed} of ${summary.total}.`);
  process.exit(summary.failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error('[refresh-shopify-tokens] crashed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
