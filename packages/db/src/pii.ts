import { createHash } from 'crypto';
import { encryptString, decryptString } from './secret-cipher';

declare const process: {
  env: {
    /**
     * Optional pepper mixed into PII hashes. MUST be left empty unless you also
     * re-hash every existing `email_hash` / `phone_hash` value and the scrubbed
     * metadata hashes (see the scrub migration), otherwise identity resolution
     * by hash will silently stop matching historical rows.
     */
    PII_HASH_PEPPER?: string;
  };
};

/**
 * Canonical email matcher. Used both to detect raw emails leaking into JSON
 * columns and to scrub them. Intentionally broad (matches anywhere in a string)
 * so it also catches emails embedded inside larger free-text values.
 */
export const EMAIL_REGEX = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

function pepper(): string {
  return process.env.PII_HASH_PEPPER || '';
}

/**
 * Canonical email normalization: trim + lowercase. Every hash of an email in
 * the system MUST go through this so that the same address always produces the
 * same `email_hash`, regardless of which connector wrote it.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deterministic, privacy-safe hash of an email address (SHA-256 over the
 * normalized address, plus an optional pepper). This is the single source of
 * truth for `customer_profiles.email_hash` — all writers and lookups must use
 * it so hashes are consistent across the codebase.
 */
export function hashEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return createHash('sha256').update(pepper() + normalized).digest('hex');
}

/**
 * Deterministic hash of a phone number (digits only, plus optional pepper).
 * Mirrors {@link hashEmail} for `customer_profiles.phone_hash`.
 */
export function hashPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const normalized = String(phone).replace(/[^0-9+]/g, '');
  if (!normalized) return null;
  return createHash('sha256').update(pepper() + normalized).digest('hex');
}

/**
 * Returns the first raw email found anywhere inside a value (string, array, or
 * nested object), or `null` if none. Used by the write-time guard to reject any
 * customer-profile write that would persist a plaintext email in a JSON column.
 */
export function findRawEmail(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const match = value.match(EMAIL_REGEX);
    return match ? match[0] : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRawEmail(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const found = findRawEmail(v);
      if (found) return found;
    }
    return null;
  }
  return null;
}

/**
 * Deep-clones a value, replacing every raw email it contains with that email's
 * canonical hash (the same hash stored in `email_hash`). Use this on any
 * metadata/JSON payload before it is written to `customer_profiles` so that
 * nested PII (e.g. inside `addresses` or a captured `rawCustomer`) is neutralized
 * while the surrounding structure is preserved.
 */
export function scrubEmails<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.replace(EMAIL_REGEX, (m) => hashEmail(m) as string) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubEmails(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubEmails(v);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Reversibly encrypts an email for storage in `customer_profiles.email_encrypted`
 * (an AES-256-GCM `enc:v1:` envelope). This is the ONLY place a customer email may
 * be persisted in recoverable form — the rest of the system stores the one-way
 * {@link hashEmail} for identity resolution. The address is normalized first so
 * the recovered value is canonical and matches its `email_hash`.
 *
 * Returns `null` for empty input. NEVER log the plaintext.
 */
export function encryptEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return encryptString(normalized);
}

/**
 * Decrypts a value produced by {@link encryptEmail} back to the plaintext email,
 * in memory only — used on the read path to display the address on the dashboard.
 * Returns `null` for null/empty/unrecoverable input. NEVER persist the result.
 */
export function decryptEmail(value: unknown): string | null {
  return decryptString(value);
}