/**
 * CustomerGroupService — evaluates user-defined, RULE-BASED customer groups
 * (Phase 5). A group's `rules` are a match mode + a list of conditions over the
 * customer's historical metrics (customer_metrics) and fused segments
 * (customer_behavior_snapshots). Membership is DYNAMIC — computed on read — so a
 * group always reflects the latest data with no membership table to maintain.
 *
 * `db` is the tenant data-plane Prisma client; typed `any` per convention.
 */

export type GroupOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'contains';

export interface GroupCondition {
  field: string;
  op: GroupOp;
  value: any;
}

export interface GroupRules {
  match: 'all' | 'any';
  conditions: GroupCondition[];
}

/** Field catalog exposed to the UI (drives the rule builder). */
export const GROUP_FIELDS: Array<{
  key: string;
  label: string;
  type: 'number' | 'enum' | 'multienum';
  ops: GroupOp[];
  options?: string[];
}> = [
  { key: 'segment', label: 'Segment', type: 'enum', ops: ['eq', 'neq', 'in', 'not_in'], options: ['VIP', 'HIGH_VALUE', 'REGULAR', 'AT_RISK', 'LOST'] },
  { key: 'fusedSegment', label: 'Fused segment', type: 'multienum', ops: ['contains'], options: ['HIGH_VALUE_ABANDONER', 'CART_ABANDONER', 'LAPSED_REACTIVATING', 'NEW_HIGH_INTENT', 'LOYAL_ACTIVE'] },
  { key: 'totalLtv', label: 'Lifetime value ($)', type: 'number', ops: ['gte', 'lte', 'gt', 'lt', 'eq'] },
  { key: 'orderCount', label: 'Order count', type: 'number', ops: ['gte', 'lte', 'gt', 'lt', 'eq'] },
  { key: 'avgOrderValue', label: 'Avg order value ($)', type: 'number', ops: ['gte', 'lte', 'gt', 'lt'] },
  { key: 'recencyDays', label: 'Days since last order', type: 'number', ops: ['gte', 'lte', 'gt', 'lt'] },
  { key: 'churnLevel', label: 'Churn level', type: 'enum', ops: ['eq', 'neq', 'in'], options: ['low', 'medium', 'high', 'critical'] },
  { key: 'churnRisk', label: 'Churn risk (0-1)', type: 'number', ops: ['gte', 'lte', 'gt', 'lt'] },
  { key: 'cltv', label: 'Projected CLTV ($)', type: 'number', ops: ['gte', 'lte', 'gt', 'lt'] },
];

interface CustomerRecord {
  profileId: string;
  segment: string | null;
  totalLtv: number;
  orderCount: number;
  avgOrderValue: number;
  recencyDays: number | null;
  churnLevel: string | null;
  churnRisk: number | null;
  cltv: number | null;
  fusedSegments: string[];
}

export class CustomerGroupService {
  /** Return the profile ids that currently match a group's rules. */
  static async evaluate(db: any, connectorInstanceId: string, rules: any): Promise<string[]> {
    const norm = normalizeRules(rules);
    if (!norm.conditions.length) return [];

    const [metrics, snaps]: [any[], any[]] = await Promise.all([
      db.customerMetrics.findMany({
        where: { connectorInstanceId },
        select: {
          customerProfileId: true, segment: true, totalRevenue: true, orderCount: true,
          avgOrderValue: true, recencyDays: true, churnLevel: true, churnRisk: true, cltv: true,
        },
      }),
      db.customerBehaviorSnapshot.findMany({
        where: { connectorInstanceId },
        select: { customerProfileId: true, fusedSegments: true },
      }),
    ]);

    // Union of profiles with metrics OR a snapshot (so fused-only, no-order
    // customers are still evaluable).
    const byProfile = new Map<string, CustomerRecord>();
    for (const m of metrics) {
      byProfile.set(m.customerProfileId, {
        profileId: m.customerProfileId,
        segment: m.segment ?? null,
        totalLtv: m.totalRevenue != null ? Number(m.totalRevenue) : 0,
        orderCount: m.orderCount ?? 0,
        avgOrderValue: m.avgOrderValue != null ? Number(m.avgOrderValue) : 0,
        recencyDays: m.recencyDays ?? null,
        churnLevel: m.churnLevel ?? null,
        churnRisk: m.churnRisk != null ? Number(m.churnRisk) : null,
        cltv: m.cltv != null ? Number(m.cltv) : null,
        fusedSegments: [],
      });
    }
    for (const s of snaps) {
      const fused = Array.isArray(s.fusedSegments) ? s.fusedSegments.map(String) : [];
      const existing = byProfile.get(s.customerProfileId);
      if (existing) existing.fusedSegments = fused;
      else
        byProfile.set(s.customerProfileId, {
          profileId: s.customerProfileId, segment: null, totalLtv: 0, orderCount: 0, avgOrderValue: 0,
          recencyDays: null, churnLevel: null, churnRisk: null, cltv: null, fusedSegments: fused,
        });
    }

    const out: string[] = [];
    for (const rec of byProfile.values()) {
      if (recordMatches(rec, norm)) out.push(rec.profileId);
    }
    return out;
  }

  static async count(db: any, connectorInstanceId: string, rules: any): Promise<number> {
    return (await this.evaluate(db, connectorInstanceId, rules)).length;
  }
}

/** Coerce arbitrary input into a safe GroupRules with a bounded condition list. */
export function normalizeRules(raw: any): GroupRules {
  const match = raw?.match === 'any' ? 'any' : 'all';
  const list = Array.isArray(raw?.conditions) ? raw.conditions : [];
  const known = new Set(GROUP_FIELDS.map((f) => f.key));
  const conditions: GroupCondition[] = list
    .filter((c: any) => c && known.has(c.field) && typeof c.op === 'string')
    .slice(0, 25)
    .map((c: any) => ({ field: String(c.field), op: c.op as GroupOp, value: c.value }));
  return { match, conditions };
}

function recordMatches(rec: CustomerRecord, rules: GroupRules): boolean {
  const results = rules.conditions.map((c) => conditionMatches(rec, c));
  return rules.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

function conditionMatches(rec: CustomerRecord, c: GroupCondition): boolean {
  // Array field (fused segments): "contains" = intersects the requested values.
  if (c.field === 'fusedSegment') {
    const want = Array.isArray(c.value) ? c.value.map(String) : [String(c.value)];
    return rec.fusedSegments.some((s) => want.includes(s));
  }

  const actual = (rec as any)[c.field];
  switch (c.op) {
    case 'eq':
      return String(actual) === String(c.value);
    case 'neq':
      return String(actual) !== String(c.value);
    case 'in':
      return Array.isArray(c.value) && c.value.map(String).includes(String(actual));
    case 'not_in':
      return Array.isArray(c.value) && !c.value.map(String).includes(String(actual));
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = Number(actual);
      const b = Number(c.value);
      if (actual == null || !Number.isFinite(a) || !Number.isFinite(b)) return false;
      return c.op === 'gt' ? a > b : c.op === 'gte' ? a >= b : c.op === 'lt' ? a < b : a <= b;
    }
    default:
      return false;
  }
}
