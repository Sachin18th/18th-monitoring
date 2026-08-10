/**
 * Populate a Shopify connector's app client_id / client_secret (needed for the
 * client-credentials token refresh). Merges into the existing encrypted
 * credential — the access token and other fields are preserved.
 *
 *   npm --workspace @kpi-platform/api run shopify:set-app-creds -- \
 *     <connectorInstanceId> <clientId> <clientSecret>
 *
 * Or set SHOPIFY_APP_CLIENT_ID / SHOPIFY_APP_CLIENT_SECRET and pass just the id.
 */
import '../config/env';
import { prisma, encryptSecret, decryptSecret } from '@kpi-platform/db';

(async () => {
  const [connectorInstanceId, argClientId, argClientSecret] = process.argv.slice(2);
  const clientId = (argClientId || process.env.SHOPIFY_APP_CLIENT_ID || '').trim();
  const clientSecret = (argClientSecret || process.env.SHOPIFY_APP_CLIENT_SECRET || '').trim();

  if (!connectorInstanceId || !clientId || !clientSecret) {
    console.error('Usage: shopify:set-app-creds -- <connectorInstanceId> <clientId> <clientSecret>');
    process.exit(2);
  }

  const cred = await prisma.connectorCredential.findFirst({
    where: { connectorInstanceId },
    orderBy: { createdAt: 'desc' },
  });
  if (!cred) {
    console.error(`No credential row found for connector ${connectorInstanceId}.`);
    process.exit(1);
  }

  let creds: Record<string, any> = {};
  try { const d = decryptSecret(cred.encryptedSecret); if (d && typeof d === 'object') creds = d; } catch { /* start fresh */ }

  const next = { ...creds, clientId, clientSecret };
  await prisma.connectorCredential.update({
    where: { id: cred.id },
    data: { encryptedSecret: encryptSecret(next), lastRotatedAt: new Date(), isActive: true },
  });

  console.log(`✓ Stored client_id/client_secret for connector ${connectorInstanceId}. Token refresh can now run.`);
  process.exit(0);
})().catch((err) => {
  console.error('[set-shopify-app-credentials] failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
