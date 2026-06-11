import { PrismaClient, Prisma } from '@prisma/client';
import { findRawEmail } from './pii';
import { isEncryptedSecret } from './secret-cipher';

declare const process: {
  env: {
    NODE_ENV?: string;
  };
};

/**
 * JSON columns on `customer_profiles` that must never contain a plaintext email.
 * Raw emails belong only in the one-way `email_hash` column.
 */
const CUSTOMER_PROFILE_JSON_FIELDS = ['externalIds', 'metadata'] as const;

/**
 * Throws if any guarded JSON field in a customer-profile write payload contains
 * a raw email address. This is the application-layer enforcement of the
 * privacy-safe design (emails are stored only as `email_hash`); writers are
 * expected to hash/scrub before reaching this point — a throw here means a leak
 * slipped through and the write is rejected rather than persisted.
 */
function assertNoRawEmail(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const payload = data as Record<string, unknown>;
  for (const field of CUSTOMER_PROFILE_JSON_FIELDS) {
    if (!(field in payload)) continue;
    const leaked = findRawEmail(payload[field]);
    if (leaked) {
      throw new Error(
        `[customer_profiles] Refusing write: raw email detected in JSON column "${field}". ` +
          `Store emails only in email_hash (use hashEmail) and scrub metadata (use scrubEmails). ` +
          `Offending value resembled: ${leaked.replace(/(.).*(@.*)/, '$1***$2')}`
      );
    }
  }
}

/**
 * Throws if a connector-credential write would persist a plaintext
 * `encryptedSecret`. Secrets must be wrapped by encryptSecret() (an `enc:v1:`
 * envelope) before they ever reach the database — this is the last-line DB guard
 * behind the CI static check.
 */
function assertEncryptedSecret(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const payload = data as Record<string, unknown>;
  if (!('encryptedSecret' in payload)) return;
  const secret = payload.encryptedSecret;
  if (secret == null) return;
  if (!isEncryptedSecret(secret)) {
    throw new Error(
      '[connector_credentials] Refusing write: encryptedSecret is not encrypted. ' +
        'Wrap the payload with encryptSecret() from @kpi-platform/db before writing.'
    );
  }
}

function guardConnectorCredentialWrite(args: any): void {
  if (!args) return;
  if (Array.isArray(args.data)) {
    args.data.forEach(assertEncryptedSecret);
  } else if (args.data) {
    assertEncryptedSecret(args.data);
  }
  if (args.create) assertEncryptedSecret(args.create);
  if (args.update) assertEncryptedSecret(args.update);
}

function guardCustomerProfileWrite(args: any): void {
  if (!args) return;
  // create / update / updateMany / createMany
  if (Array.isArray(args.data)) {
    args.data.forEach(assertNoRawEmail);
  } else if (args.data) {
    assertNoRawEmail(args.data);
  }
  // upsert
  if (args.create) assertNoRawEmail(args.create);
  if (args.update) assertNoRawEmail(args.update);
}

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  }).$extends({
    name: 'customer-profile-pii-guard',
    query: {
      customerProfile: {
        create({ args, query }) {
          guardCustomerProfileWrite(args);
          return query(args);
        },
        update({ args, query }) {
          guardCustomerProfileWrite(args);
          return query(args);
        },
        updateMany({ args, query }) {
          guardCustomerProfileWrite(args);
          return query(args);
        },
        upsert({ args, query }) {
          guardCustomerProfileWrite(args);
          return query(args);
        },
        createMany({ args, query }) {
          guardCustomerProfileWrite(args);
          return query(args);
        },
      },
      connectorCredential: {
        create({ args, query }) {
          guardConnectorCredentialWrite(args);
          return query(args);
        },
        update({ args, query }) {
          guardConnectorCredentialWrite(args);
          return query(args);
        },
        updateMany({ args, query }) {
          guardConnectorCredentialWrite(args);
          return query(args);
        },
        upsert({ args, query }) {
          guardConnectorCredentialWrite(args);
          return query(args);
        },
        createMany({ args, query }) {
          guardConnectorCredentialWrite(args);
          return query(args);
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// The runtime client is wrapped with a $extends() PII guard. That guard only
// intercepts query behavior for customerProfile writes — it preserves the full
// model/$transaction/$queryRaw surface callers use (no code relies on $use/$on,
// the only methods $extends drops). Expose it typed as PrismaClient so all
// existing call sites keep their model accessors.
export const prisma =
  globalForPrisma.prisma || (createPrismaClient() as unknown as PrismaClient);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export { Prisma };
export type { PrismaClient } from '@prisma/client';

export default prisma;