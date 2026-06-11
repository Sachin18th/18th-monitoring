import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Authenticated encryption for connector credentials (the JSON blob stored in
 * `connector_credentials.encrypted_secret`).
 *
 * Strategy: AES-256-GCM with a 96-bit random IV and a 128-bit auth tag. The IV
 * and tag are stored INLINE with the ciphertext in a single self-describing
 * envelope string, so no extra DB columns are required:
 *
 *     enc:v1:<base64( iv[12] | tag[16] | ciphertext )>
 *
 * The `enc:v1:` prefix lets us (a) detect already-encrypted values so the
 * backfill migration is idempotent, (b) route legacy plaintext rows through a
 * compatibility path on read until the migration runs, and (c) statically gate
 * against plaintext writes in CI and at the DB layer.
 *
 * KEY MANAGEMENT: the 256-bit key comes from the environment, never the DB. For
 * a KMS-managed deployment (AWS KMS / GCP KMS / Vault), replace `loadRawKey()`
 * with a call that fetches/derives the data key from the KMS — the envelope
 * format and the rest of the app layer stay unchanged.
 */

const ENVELOPE_PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Fixed salt for passphrase-derived keys; the secret entropy is the passphrase. */
const SCRYPT_SALT = 'kpi-platform/connector-secret/v1';

declare const process: {
  env: {
    NODE_ENV?: string;
    /** Preferred: a 32-byte key as 64 hex chars or base64; otherwise a passphrase. */
    CONNECTOR_SECRET_KEY?: string;
  };
};

let cachedKey: Buffer | null = null;

/**
 * Resolves the 32-byte AES key from `CONNECTOR_SECRET_KEY`.
 *   - 64 hex chars               -> used directly
 *   - base64 decoding to 32 bytes -> used directly
 *   - any other string           -> scrypt-derived to 32 bytes
 *
 * Missing key is a hard error in production; in dev/test we fall back to a
 * clearly-marked, deterministic dev key so local runs and tests work without
 * blocking on secret provisioning. The fallback is NEVER used in production.
 */
function loadRawKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.CONNECTOR_SECRET_KEY;

  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CONNECTOR_SECRET_KEY is not set. Refusing to encrypt/decrypt connector ' +
          'credentials without a configured key. Provide a 32-byte key (hex or base64) via env/KMS.'
      );
    }
    // eslint-disable-next-line no-console
    console.warn(
      '[secret-cipher] CONNECTOR_SECRET_KEY not set — using an INSECURE dev-only key. ' +
        'Set CONNECTOR_SECRET_KEY before deploying.'
    );
    cachedKey = scryptSync('insecure-dev-key', SCRYPT_SALT, KEY_BYTES);
    return cachedKey;
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    cachedKey = Buffer.from(raw, 'hex');
    return cachedKey;
  }

  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === KEY_BYTES) {
      cachedKey = decoded;
      return cachedKey;
    }
  } catch {
    /* fall through to scrypt derivation */
  }

  cachedKey = scryptSync(raw, SCRYPT_SALT, KEY_BYTES);
  return cachedKey;
}

/** True if `value` is an AES-256-GCM envelope produced by {@link encryptSecret}. */
export function isEncryptedSecret(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ENVELOPE_PREFIX);
}

/**
 * Encrypts an arbitrary UTF-8 string into an `enc:v1:` envelope using the same
 * AES-256-GCM key/format as {@link encryptSecret}. Unlike `encryptSecret`, the
 * payload is treated as an opaque string (not JSON), so it round-trips byte for
 * byte via {@link decryptString}. Used for reversible PII-at-rest (e.g. a
 * customer email that must be displayable on the dashboard).
 *
 * Idempotent: an already-encrypted value is returned unchanged.
 */
export function encryptString(plaintext: string): string {
  if (isEncryptedSecret(plaintext)) return plaintext;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadRawKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENVELOPE_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Decrypts an `enc:v1:` envelope produced by {@link encryptString} back into the
 * original UTF-8 string, in memory only. A value that is NOT an envelope is
 * returned as-is (legacy plaintext compatibility). Returns `null` for
 * null/empty/unparseable input. NEVER log the return value.
 */
export function decryptString(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  if (!isEncryptedSecret(value)) return value;

  try {
    const payload = Buffer.from(value.slice(ENVELOPE_PREFIX.length), 'base64');
    const iv = payload.subarray(0, IV_BYTES);
    const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, loadRawKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Do not include the value or error detail — it may contain secret material.
    return null;
  }
}

/**
 * Encrypts a credential payload into an `enc:v1:` envelope. Accepts either an
 * object (serialized as JSON) or an already-serialized JSON string. Idempotent:
 * a value that is already encrypted is returned unchanged so backfills are safe
 * to re-run.
 */
export function encryptSecret(payload: Record<string, any> | string | null | undefined): string {
  if (isEncryptedSecret(payload)) return payload as string;

  const plaintext = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadRawKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ENVELOPE_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Decrypts an `enc:v1:` envelope back into the credential object, in memory only.
 *
 * Backward compatibility: a value that is NOT an envelope is treated as a legacy
 * plaintext JSON string (or object) and parsed directly, so reads keep working
 * during the window between deploying this code and running the backfill
 * migration. Returns `{}` for null/empty/unparseable input.
 *
 * NEVER log the return value of this function.
 */
export function decryptSecret(value: unknown): Record<string, any> {
  if (value == null || value === '') return {};

  // Legacy plaintext rows (pre-migration): not an envelope.
  if (!isEncryptedSecret(value)) {
    if (typeof value === 'object') return value as Record<string, any>;
    try {
      const parsed = JSON.parse(value as string);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  try {
    const payload = Buffer.from((value as string).slice(ENVELOPE_PREFIX.length), 'base64');
    const iv = payload.subarray(0, IV_BYTES);
    const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const ciphertext = payload.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, loadRawKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

    const parsed = JSON.parse(decrypted);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Do not include the value or error detail — it may contain secret material.
    return {};
  }
}