/**
 * One-time data migration: encrypt existing plaintext `connector_credentials`.
 *
 * Historically `encrypted_secret` stored a PLAINTEXT JSON blob. This script reads
 * every row, and for any value not already wrapped in an `enc:v1:` envelope,
 * encrypts it in place with AES-256-GCM (IV + auth tag are stored inline in the
 * envelope, so no schema change is needed).
 *
 * Idempotent: rows already encrypted are skipped, so it is safe to re-run.
 *
 * Run with the SAME CONNECTOR_SECRET_KEY the app uses:
 *   CONNECTOR_SECRET_KEY=... npm run --workspace @kpi-platform/db secrets:encrypt
 *
 * SECURITY: this script never logs secret material — only row counts.
 */
import { prisma } from '../prisma-client';
import { encryptSecret, isEncryptedSecret } from '../secret-cipher';

async function main(): Promise<void> {
  const rows = await prisma.connectorCredential.findMany({
    select: { id: true, encryptedSecret: true },
  });

  let encrypted = 0;
  let alreadyEncrypted = 0;
  let empty = 0;

  for (const row of rows) {
    const secret = row.encryptedSecret;

    if (!secret) {
      empty++;
      continue;
    }
    if (isEncryptedSecret(secret)) {
      alreadyEncrypted++;
      continue;
    }

    // `secret` is the legacy plaintext JSON string; encrypt it verbatim.
    await prisma.connectorCredential.update({
      where: { id: row.id },
      data: { encryptedSecret: encryptSecret(secret) },
    });
    encrypted++;
  }

  console.log(
    `[encrypt-connector-credentials] total=${rows.length} encrypted=${encrypted} ` +
      `alreadyEncrypted=${alreadyEncrypted} empty=${empty}`
  );
}

main()
  .catch((err) => {
    // Log only the message — never the row/secret being processed.
    console.error('[encrypt-connector-credentials] FAILED:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });