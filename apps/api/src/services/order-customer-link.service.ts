import { hashEmail, hashPhone, encryptEmail } from '@kpi-platform/db';
import { IdentityResolver } from './identity-resolver.service';

/**
 * Attach a canonical order to the CustomerProfile golden record.
 *
 * Every order writer (Shopify / BigCommerce / Adobe Commerce batch syncs and the
 * offline CSV import) funnels through here, so `canonical_orders.customer_profile_id`
 * means the same thing whatever the source. That single column is what lets one
 * customer's online and in-store purchases be read as one history.
 *
 * Best-effort by design: the order is the payload and is worth keeping even when
 * attribution fails, so every error resolves to `null` rather than throwing.
 */
export async function linkOrderToCustomer(
  db: any,
  scope: { siteId: string; connectorInstanceId: string },
  input: {
    /** Plaintext email from the order payload — hashed here, never persisted raw. */
    email?: string | null;
    /** Plaintext phone from the order payload — hashed here, never persisted raw. */
    phone?: string | null;
    /** Platform customer id (Shopify/BigCommerce/Adobe numeric id, POS loyalty id). */
    externalId?: string | number | null;
    /** external_ids key the id belongs to, e.g. 'shopify'. */
    platform: string;
    /** Provenance recorded on newly created profiles. */
    source: string;
  },
): Promise<string | null> {
  const emailHash = hashEmail(input.email);
  const phoneHash = hashPhone(input.phone);
  const externalId = input.externalId != null && String(input.externalId).trim() ? input.externalId : null;

  // Nothing to match on — a genuine guest checkout. Leave the order unattributed
  // rather than minting a profile that can never be matched to anyone.
  if (!emailHash && !phoneHash && !externalId) return null;

  try {
    const result = await IdentityResolver.resolve(db, scope, {
      emailHash,
      emailEncrypted: input.email ? encryptEmail(input.email) : null,
      phoneHash,
      externalId,
      platform: input.platform,
      lifecycleHint: externalId || emailHash ? 'RETURNING' : null,
      source: input.source,
    });
    return result.profileId;
  } catch (err: any) {
    console.error('[linkOrderToCustomer] identity resolution failed', {
      connectorInstanceId: scope.connectorInstanceId,
      platform: input.platform,
      error: err?.message,
    });
    return null;
  }
}
