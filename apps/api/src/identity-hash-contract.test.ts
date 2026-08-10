import { describe, it, expect, afterEach } from 'vitest';
import { hashEmail, hashPhone, normalizeEmail } from '../../../packages/db/src/pii';

/**
 * IDENTITY HASH CONTRACT — the CDP join key between this platform (live behavior)
 * and the ai-agent-ecom ML engine (customer history). See docs/CDP-IMPLEMENTATION-PLAN.md §4/§7.1.
 *
 * The two systems stitch an anonymous session to a known customer by matching the
 * email hash. That ONLY works if both sides hash identically:
 *
 *   - here (packages/db/src/pii.ts):        SHA-256( PII_HASH_PEPPER + trim().toLowerCase() )
 *   - ai-agent-ecom (customer_pii.py):      SHA-256( trim().lower() )   // NO pepper
 *
 * The golden hex values below were produced with PII_HASH_PEPPER UNSET and verified,
 * byte-for-byte, against ai-agent-ecom's generate_email_hash. They are the canonical
 * cross-system contract: if any of these change, the CDP identity join breaks silently
 * (hashes still generate — they just stop matching the engine). When the engine is
 * ported (Phase 2), it MUST reproduce these same hex values in a mirror test.
 *
 * INVARIANT: PII_HASH_PEPPER must stay empty (or be applied identically on BOTH sides),
 * otherwise email matching fails. The pepper test below guards that.
 */

// Canonical email hashes — MUST equal ai-agent-ecom generate_email_hash() output.
const EMAIL_GOLDEN: Record<string, string> = {
  'user@example.com': 'b4c9a289323b21a01c3e940f150eb9b8c542587f1abfd8f0e1cc1ffc5e475514',
  'già@example.com': '8e89f15c6689703b57105ebc9dd19d055e598926a30b24a5a4ad6ebea814c162', // unicode / UTF-8
  'a.b+tag@sub.example.co.uk': '5a0dbf921283b433f1b73e31d5d7f6a9dfd228d20d1eaa242af6d873025b1de9',
};

const originalPepper = process.env.PII_HASH_PEPPER;

afterEach(() => {
  // pepper() reads process.env live on every call — always restore it.
  if (originalPepper === undefined) delete process.env.PII_HASH_PEPPER;
  else process.env.PII_HASH_PEPPER = originalPepper;
});

describe('identity hash contract (CDP join key)', () => {
  it('requires PII_HASH_PEPPER to be empty for cross-system parity', () => {
    // If a pepper is configured, these golden values (and the ai-agent-ecom join) are invalid.
    expect(process.env.PII_HASH_PEPPER ?? '').toBe('');
  });

  it('hashEmail produces the canonical cross-system hex for known addresses', () => {
    for (const [email, expected] of Object.entries(EMAIL_GOLDEN)) {
      expect(hashEmail(email), `hashEmail(${email})`).toBe(expected);
    }
  });

  it('normalizes case and surrounding whitespace before hashing', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
    expect(hashEmail('  User@Example.COM  ')).toBe(EMAIL_GOLDEN['user@example.com']);
    expect(hashEmail('USER@EXAMPLE.COM')).toBe(EMAIL_GOLDEN['user@example.com']);
  });

  it('returns null for empty / missing email', () => {
    expect(hashEmail('')).toBeNull();
    expect(hashEmail(null)).toBeNull();
    expect(hashEmail(undefined)).toBeNull();
    expect(hashEmail('   ')).toBeNull();
  });

  it('a non-empty pepper CHANGES the email hash (why the invariant matters)', () => {
    const canonical = hashEmail('user@example.com');
    process.env.PII_HASH_PEPPER = 's3cr3t-pepper';
    const peppered = hashEmail('user@example.com');
    expect(peppered).not.toBeNull();
    // Different from the canonical value -> would no longer match ai-agent-ecom.
    expect(peppered).not.toBe(canonical);
  });
});

describe('phone hash contract', () => {
  it('hashPhone keeps a leading "+" (digits and plus only)', () => {
    // Canonical here. NOTE: this DIVERGES from ai-agent-ecom generate_mobile_hash(),
    // which strips to digits-only (\D). Phone-based stitching is therefore NOT safe
    // until both sides are aligned (CDP plan §7.1, finding 2). Guard the current shape:
    expect(hashPhone('+15551234567')).toBe(
      '8a59780bb8cd2ba022bfa5ba2ea3b6e07af17a7d8b30c1f9b3390e36f69019e4',
    );
    expect(hashPhone('5551234567')).toBe(
      '3c95277da5fd0da6a1a44ee3fdf56d20af6c6d242695a40e18e6e90dc3c5872c',
    );
    // Formatting is stripped, but the "+" is retained -> "+1..." != "1...".
    expect(hashPhone('+1 (555) 123-4567')).toBe(hashPhone('+15551234567'));
    expect(hashPhone('+15551234567')).not.toBe(hashPhone('15551234567'));
  });

  it('returns null for empty / missing phone', () => {
    expect(hashPhone('')).toBeNull();
    expect(hashPhone(null)).toBeNull();
    expect(hashPhone(undefined)).toBeNull();
  });
});
