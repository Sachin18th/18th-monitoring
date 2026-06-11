/**
 * Rotate a connector's stored secret (e.g. a Shopify adminApiAccessToken).
 *
 * Use this AFTER you have regenerated the token in the upstream provider's admin
 * console (see docs/security/connector-secret-rotation.md). It re-encrypts the
 * new credentials and writes them to the connector's active credential row,
 * stamping last_rotated_at.
 *
 * New credentials are read from a JSON FILE (not argv) so the secret never lands
 * in shell history or the process arg list:
 *
 *   CONNECTOR_SECRET_KEY=... npm run --workspace @kpi-platform/db secrets:rotate \
 *     -- <connectorInstanceId> <path/to/new-credentials.json>
 *
 * SECURITY: never logs the secret — only the connector id and a success flag.
 */
import { readFileSync } from 'node:fs';
import { prisma } from '../prisma-client';
import { encryptSecret } from '../secret-cipher';

async function main(): Promise<void> {
  const [connectorInstanceId, credentialsPath] = process.argv.slice(2);

  if (!connectorInstanceId || !credentialsPath) {
    throw new Error(
      'Usage: secrets:rotate -- <connectorInstanceId> <path/to/new-credentials.json>'
    );
  }

  let newCredentials: Record<string, any>;
  try {
    newCredentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  } catch {
    // Do not echo file contents — it holds the new secret.
    throw new Error(`Could not read/parse credentials JSON at: ${credentialsPath}`);
  }

  const active = await prisma.connectorCredential.findFirst({
    where: { connectorInstanceId, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (!active) {
    throw new Error(`No active credential found for connectorInstanceId=${connectorInstanceId}`);
  }

  await prisma.connectorCredential.update({
    where: { id: active.id },
    data: {
      encryptedSecret: encryptSecret(newCredentials),
      lastRotatedAt: new Date(),
    },
  });

  console.log(
    `[rotate-connector-secret] rotated secret for connectorInstanceId=${connectorInstanceId} ` +
      `(credentialId=${active.id})`
  );
}

main()
  .catch((err) => {
    console.error('[rotate-connector-secret] FAILED:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });