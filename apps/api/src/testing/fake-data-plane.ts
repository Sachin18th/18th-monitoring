/**
 * In-memory stand-in for the tenant data-plane Prisma client, implementing just
 * the model methods IdentityResolver uses — and, crucially, enforcing the SAME
 * unique constraints the real Postgres schema enforces:
 *   - identity_links      unique (connector_instance_id, identifier_type, identifier_value)
 *   - customer_profiles   unique (connector_instance_id, email_hash)
 *
 * This lets identity-resolution logic (stitch / no-duplicate / merge / isolation)
 * be tested deterministically without a database. Used by both the vitest spec and
 * the tsx verification harness.
 */

let seq = 0;
const nextId = (p: string) => `${p}_${++seq}`;

export interface FakeRow {
  [k: string]: any;
}

export class FakeDataPlane {
  customerProfiles: FakeRow[] = [];
  identityLinks: FakeRow[] = [];
  storefrontSessions: FakeRow[] = [];
  storefrontEvents: FakeRow[] = [];
  customerSessions: FakeRow[] = [];
  customerEvents: FakeRow[] = [];
  canonicalOrders: FakeRow[] = [];
  profileMerges: FakeRow[] = [];

  // Seed helpers (tests build fixtures with these) ---------------------------
  seedSession(row: Partial<FakeRow>): FakeRow {
    const r = {
      id: nextId('sess'),
      customerProfileId: null,
      funnelStage: 'visit',
      startedAt: new Date(),
      lastActiveAt: new Date(),
      ...row,
    };
    this.storefrontSessions.push(r);
    return r;
  }
  seedEvent(row: Partial<FakeRow>): FakeRow {
    const r = { id: nextId('evt'), customerProfileId: null, ...row };
    this.storefrontEvents.push(r);
    return r;
  }
  seedOrder(row: Partial<FakeRow>): FakeRow {
    const r = { id: nextId('order'), customerProfileId: null, ...row };
    this.canonicalOrders.push(r);
    return r;
  }
  seedProfile(row: Partial<FakeRow>): FakeRow {
    const r = {
      id: row.id || nextId('prof'),
      externalIds: {},
      emailHash: null,
      emailEncrypted: null,
      phoneHash: null,
      lifecycleState: 'NEW_GUEST',
      identityConfidence: null,
      totalLtv: null,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      metadata: {},
      ...row,
    };
    this.customerProfiles.push(r);
    return r;
  }

  private p2002() {
    const e: any = new Error('Unique constraint failed');
    e.code = 'P2002';
    return e;
  }

  // customerProfile ----------------------------------------------------------
  customerProfile = {
    findUnique: async ({ where }: any) => this.customerProfiles.find((p) => p.id === where.id) || null,
    findFirst: async ({ where }: any) => {
      return (
        this.customerProfiles.find((p) => {
          if (where.emailHash !== undefined && where.connectorInstanceId !== undefined) {
            return p.connectorInstanceId === where.connectorInstanceId && p.emailHash === where.emailHash;
          }
          if (where.phoneHash !== undefined && where.connectorInstanceId !== undefined) {
            return p.connectorInstanceId === where.connectorInstanceId && p.phoneHash === where.phoneHash;
          }
          if (where.externalIds && where.siteId !== undefined) {
            const key = where.externalIds.path[0];
            return p.siteId === where.siteId && String(p.externalIds?.[key]) === String(where.externalIds.equals);
          }
          return false;
        }) || null
      );
    },
    create: async ({ data }: any) => {
      if (data.emailHash) {
        const dup = this.customerProfiles.find(
          (p) => p.connectorInstanceId === data.connectorInstanceId && p.emailHash === data.emailHash,
        );
        if (dup) throw this.p2002();
      }
      const row = this.seedProfile(data);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.customerProfiles.find((p) => p.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    },
    delete: async ({ where }: any) => {
      const i = this.customerProfiles.findIndex((p) => p.id === where.id);
      if (i >= 0) this.customerProfiles.splice(i, 1);
      return {};
    },
  };

  // identityLink -------------------------------------------------------------
  private linkKey(w: any) {
    const c = w.connectorInstanceId_identifierType_identifierValue;
    return this.identityLinks.find(
      (l) =>
        l.connectorInstanceId === c.connectorInstanceId &&
        l.identifierType === c.identifierType &&
        l.identifierValue === c.identifierValue,
    );
  }
  identityLink = {
    findUnique: async ({ where }: any) => this.linkKey(where) || null,
    upsert: async ({ where, create, update }: any) => {
      const existing = this.linkKey(where);
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const row = { id: nextId('link'), ...create };
      this.identityLinks.push(row);
      return row;
    },
    findMany: async ({ where }: any) =>
      this.identityLinks.filter((l) => l.customerProfileId === where.customerProfileId),
    update: async ({ where, data }: any) => {
      const row = this.identityLinks.find((l) => l.id === where.id);
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    },
    delete: async ({ where }: any) => {
      const i = this.identityLinks.findIndex((l) => l.id === where.id);
      if (i >= 0) this.identityLinks.splice(i, 1);
      return {};
    },
  };

  // storefront + customer session/event --------------------------------------
  private updateMany(rows: FakeRow[], where: any, data: any) {
    let count = 0;
    for (const r of rows) {
      let match = true;
      for (const [k, v] of Object.entries(where)) {
        if (r[k] !== v) {
          match = false;
          break;
        }
      }
      if (match) {
        Object.assign(r, data);
        count++;
      }
    }
    return { count };
  }
  storefrontSession = {
    updateMany: async ({ where, data }: any) => this.updateMany(this.storefrontSessions, where, data),
  };
  storefrontEvent = {
    updateMany: async ({ where, data }: any) => this.updateMany(this.storefrontEvents, where, data),
  };
  customerSession = {
    updateMany: async ({ where, data }: any) => this.updateMany(this.customerSessions, where, data),
  };
  customerEvent = {
    updateMany: async ({ where, data }: any) => this.updateMany(this.customerEvents, where, data),
  };
  canonicalOrder = {
    updateMany: async ({ where, data }: any) => this.updateMany(this.canonicalOrders, where, data),
  };
  profileMerge = {
    create: async ({ data }: any) => {
      const row = { id: nextId('merge'), ...data };
      this.profileMerges.push(row);
      return row;
    },
  };
}
