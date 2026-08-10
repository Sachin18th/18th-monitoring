import { describe, it, expect, beforeEach } from 'vitest';
import { IdentityResolver } from './identity-resolver.service';
import { FakeDataPlane } from '../testing/fake-data-plane';

/**
 * IdentityResolver behavior — the CDP identity-resolution guarantees
 * (docs/CDP-IMPLEMENTATION-PLAN.md §4). Runs against an in-memory data plane
 * that enforces the same unique constraints as Postgres, so these assertions
 * hold against the real schema too.
 */

const SCOPE = { siteId: 's1', connectorInstanceId: 'c1' };

describe('IdentityResolver', () => {
  let db: FakeDataPlane;
  beforeEach(() => {
    db = new FakeDataPlane();
  });

  it('stitches an anonymous visitor to a profile and back-fills prior sessions/events', async () => {
    // A shopper browses anonymously first (only visitor_id known).
    const sess = db.seedSession({ connectorInstanceId: 'c1', visitorId: 'v1', funnelStage: 'add_to_cart' });
    const evt = db.seedEvent({ connectorInstanceId: 'c1', visitorId: 'v1' });

    const first = await IdentityResolver.resolve(db as any, SCOPE, { visitorId: 'v1' });
    expect(first.created).toBe(true);
    expect(sess.customerProfileId).toBe(first.profileId); // prior session back-filled
    expect(evt.customerProfileId).toBe(first.profileId);

    // Later, same visitor identifies at checkout (email + platform id appear).
    const second = await IdentityResolver.resolve(db as any, SCOPE, {
      emailHash: 'HASH_A',
      emailEncrypted: 'enc:v1:xxx',
      externalId: 123,
      platform: 'shopify',
      visitorId: 'v1',
    });

    // Same golden record, now upgraded with identity — no second profile created.
    expect(second.profileId).toBe(first.profileId);
    expect(db.customerProfiles).toHaveLength(1);
    const profile = db.customerProfiles[0];
    expect(profile.emailHash).toBe('HASH_A');
    // Stored as a string: JSON equality is type-sensitive and the customer-sync
    // services all write String(id), so the resolver must match that shape.
    expect(profile.externalIds.shopify).toBe('123');
    expect(profile.lifecycleState).toBe('RETURNING');

    // Every identifier now edges to the one profile.
    const types = db.identityLinks.map((l) => l.identifierType).sort();
    expect(types).toEqual(['email_hash', 'external_id', 'visitor_id']);
    expect(db.identityLinks.every((l) => l.customerProfileId === profile.id)).toBe(true);
  });

  it('never creates a duplicate golden record for the same email', async () => {
    const a = await IdentityResolver.resolve(db as any, SCOPE, { emailHash: 'HASH_B', externalId: 1 });
    const b = await IdentityResolver.resolve(db as any, SCOPE, { emailHash: 'HASH_B', externalId: 1 });
    expect(a.profileId).toBe(b.profileId);
    expect(db.customerProfiles).toHaveLength(1);
  });

  it('merges a guest profile into the deterministic one when they turn out to be the same person', async () => {
    // Known customer B exists from history (email HASH_C).
    const bRes = await IdentityResolver.resolve(db as any, SCOPE, { emailHash: 'HASH_C', externalId: 222, platform: 'shopify' });
    // Separately, an anonymous visitor v2 browses and gets a guest profile A.
    const sess = db.seedSession({ connectorInstanceId: 'c1', visitorId: 'v2', funnelStage: 'product_view' });
    const aRes = await IdentityResolver.resolve(db as any, SCOPE, { visitorId: 'v2' });
    expect(aRes.profileId).not.toBe(bRes.profileId);
    expect(db.customerProfiles).toHaveLength(2);

    // v2 then identifies as email HASH_C → A and B are the same person → merge.
    const merged = await IdentityResolver.resolve(db as any, SCOPE, { emailHash: 'HASH_C', visitorId: 'v2' });
    expect(merged.stitched).toBe(true);
    expect(merged.profileId).toBe(bRes.profileId); // deterministic profile survives
    expect(db.customerProfiles).toHaveLength(1); // guest A absorbed
    expect(sess.customerProfileId).toBe(bRes.profileId); // v2's session re-pointed
    expect(db.profileMerges).toHaveLength(1);
    expect(db.identityLinks.find((l) => l.identifierType === 'visitor_id' && l.identifierValue === 'v2')?.customerProfileId).toBe(
      bRes.profileId,
    );
  });

  // Offline / POS matching (CDP Phase A) ------------------------------------
  //
  // An in-store till usually captures a phone number and nothing else. These
  // guarantee that such a row lands on the shopper's existing online profile —
  // without letting a shared handset fuse two different people together.

  it('matches an offline order to the existing online customer by phone alone', async () => {
    // The shopper is known online (email + Shopify id + phone from customer sync).
    const online = await IdentityResolver.resolve(db as any, SCOPE, {
      emailHash: 'HASH_ONLINE',
      phoneHash: 'PHONE_1',
      externalId: 555,
      platform: 'shopify',
    });

    // Later they buy in-store; the POS export carries only a phone number.
    const offline = await IdentityResolver.resolve(db as any, SCOPE, {
      phoneHash: 'PHONE_1',
      source: 'csv_upload',
    });

    expect(offline.profileId).toBe(online.profileId);
    expect(offline.matchedBy).toBe('phone_hash');
    expect(offline.created).toBe(false);
    expect(offline.phoneConflict).toBe(false);
    expect(db.customerProfiles).toHaveLength(1);
  });

  it('creates one offline-only profile for a POS shopper with no online history', async () => {
    const first = await IdentityResolver.resolve(db as any, SCOPE, { phoneHash: 'PHONE_NEW', source: 'csv_upload' });
    expect(first.created).toBe(true);

    // A second in-store visit from the same number reuses that profile.
    const second = await IdentityResolver.resolve(db as any, SCOPE, { phoneHash: 'PHONE_NEW', source: 'csv_upload' });
    expect(second.profileId).toBe(first.profileId);
    expect(second.created).toBe(false);
    expect(db.customerProfiles).toHaveLength(1);

    const profile = db.customerProfiles[0];
    expect(profile.phoneHash).toBe('PHONE_NEW');
    // Known-but-less-certain: identified by phone, so not left as an anonymous guest.
    expect(profile.lifecycleState).toBe('RETURNING');
    expect(Number(profile.identityConfidence)).toBe(0.9);
  });

  it('absorbs a phone-only offline profile into the online one when an email later ties them', async () => {
    // Offline import first: phone only, no email captured at the till.
    const offline = await IdentityResolver.resolve(db as any, SCOPE, { phoneHash: 'PHONE_2', source: 'csv_upload' });
    const online = await IdentityResolver.resolve(db as any, SCOPE, { emailHash: 'HASH_LATER' });
    expect(offline.profileId).not.toBe(online.profileId);

    // A later order carries both → same person → the emailed profile survives.
    const merged = await IdentityResolver.resolve(db as any, SCOPE, { emailHash: 'HASH_LATER', phoneHash: 'PHONE_2' });
    expect(merged.stitched).toBe(true);
    expect(merged.phoneConflict).toBe(false);
    expect(merged.profileId).toBe(online.profileId);
    expect(db.customerProfiles).toHaveLength(1);
    expect(db.customerProfiles[0].phoneHash).toBe('PHONE_2'); // phone carried over
  });

  it('refuses to merge two emailed customers that share a phone number', async () => {
    const a = await IdentityResolver.resolve(db as any, SCOPE, { emailHash: 'HASH_A', phoneHash: 'SHARED_PHONE' });
    // Partner shops with the same household number but their own email.
    const b = await IdentityResolver.resolve(db as any, SCOPE, { emailHash: 'HASH_B', phoneHash: 'SHARED_PHONE' });

    expect(b.profileId).not.toBe(a.profileId);
    expect(b.phoneConflict).toBe(true);
    expect(b.stitched).toBe(false);
    expect(db.customerProfiles).toHaveLength(2);

    // The phone edge stays with whoever owned it — it must not ping-pong.
    const phoneLinks = db.identityLinks.filter((l) => l.identifierType === 'phone_hash');
    expect(phoneLinks).toHaveLength(1);
    expect(phoneLinks[0].customerProfileId).toBe(a.profileId);
  });

  it('does not attribute an order to a phone owner whose email differs from the order email', async () => {
    const owner = await IdentityResolver.resolve(db as any, SCOPE, { emailHash: 'HASH_OWNER', phoneHash: 'SHARED_PHONE' });

    // Someone else's purchase, keyed to the same handset but a new email.
    const other = await IdentityResolver.resolve(db as any, SCOPE, { emailHash: 'HASH_OTHER', phoneHash: 'SHARED_PHONE' });

    expect(other.profileId).not.toBe(owner.profileId);
    expect(other.created).toBe(true);
    expect(other.phoneConflict).toBe(true);
    // The new profile must NOT inherit the contested number.
    expect(db.customerProfiles.find((p) => p.id === other.profileId)?.phoneHash).toBe('SHARED_PHONE');
    expect(db.customerProfiles.find((p) => p.id === owner.profileId)?.emailHash).toBe('HASH_OWNER');
  });

  it('re-points order history when two profiles merge', async () => {
    const offline = await IdentityResolver.resolve(db as any, SCOPE, { phoneHash: 'PHONE_3' });
    const order = db.seedOrder({ connectorInstanceId: 'c1', customerProfileId: offline.profileId });
    const online = await IdentityResolver.resolve(db as any, SCOPE, { emailHash: 'HASH_MERGE' });

    await IdentityResolver.resolve(db as any, SCOPE, { emailHash: 'HASH_MERGE', phoneHash: 'PHONE_3' });

    // The absorbed profile is deleted — its orders must follow the survivor or they
    // vanish from every customer total.
    expect(order.customerProfileId).toBe(online.profileId);
  });

  it('isolates identity by connector (same email, different connector = different profile)', async () => {
    const c1 = await IdentityResolver.resolve(db as any, { siteId: 's1', connectorInstanceId: 'c1' }, { emailHash: 'HASH_D' });
    const c2 = await IdentityResolver.resolve(db as any, { siteId: 's1', connectorInstanceId: 'c2' }, { emailHash: 'HASH_D' });
    expect(c1.profileId).not.toBe(c2.profileId);
    expect(db.customerProfiles).toHaveLength(2);
  });
});
