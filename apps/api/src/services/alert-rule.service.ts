import crypto from 'crypto';
import { AlertRuleInput, alertRuleInputSchema, RuleCriteria } from '../utils/alerting/rule-criteria';
import { getScopedClient, queryAllSiteClients, findInSiteClients } from '../lib/tenant-prisma';

/**
 * DB-backed CRUD for alert rules. This is the source of truth that the Alert
 * Center config UI writes to and the AlertEngine reads from. Rules live in the
 * `alert_rules` table; the configurable condition + recipients live in the
 * `criteria` JSON column.
 *
 * Storage: rules are SITE-PARTITIONED across the site's store DBs (a store-scoped
 * rule lives in its store's DB; a project-wide rule in the site's primary store
 * DB). List/dedup fan out across all the site's store DBs; id lookups locate the
 * owning DB first. With the data plane off this all collapses to the shared
 * control DB, unchanged from before.
 */
export class AlertRuleService {
  private static toBool(v: unknown): boolean {
    return v === 1 || v === true;
  }

  private static serialize(row: any) {
    return {
      id: row.id,
      siteId: row.siteId,
      connectorInstanceId: row.connectorInstanceId ?? null,
      name: row.name,
      description: row.description ?? '',
      severity: row.severity,
      enabled: this.toBool(row.enabled),
      cooldownMinutes: row.cooldownMinutes ?? 60,
      criteria: (row.criteria ?? {}) as RuleCriteria,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * @param connectorInstanceId When set, returns only the rules that apply to
   *   that store: rules scoped to it, plus project-wide rules (null scope,
   *   which evaluate the whole project and must stay visible whichever store is
   *   selected). Omit it — as the AlertEngine does — to get every rule of the site.
   */
  static async list(siteId: string, connectorInstanceId?: string | null) {
    const scoped = connectorInstanceId && connectorInstanceId !== 'all' ? connectorInstanceId : null;
    const rows = await queryAllSiteClients(siteId, (db) =>
      db.alertRule.findMany({
        where: {
          siteId,
          ...(scoped ? { OR: [{ connectorInstanceId: scoped }, { connectorInstanceId: null }] } : {}),
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    // Re-sort the merged set (each store DB was individually ordered).
    rows.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return rows.map((r: any) => this.serialize(r));
  }

  static async get(siteId: string, id: string) {
    const found = await findInSiteClients(siteId, (db) => db.alertRule.findFirst({ where: { id, siteId } }));
    return found ? this.serialize(found.row) : null;
  }

  static async create(siteId: string, tenantId: string, input: AlertRuleInput) {
    const data = alertRuleInputSchema.parse(input);

    // One rule per metric per store scope. The same condition (metricFamily +
    // metric for a given connector, null = project-wide) must not be configured
    // twice — a duplicate would double-alert and clutter the Alert Center. If a
    // matching rule already exists we reject; editing that rule is the intended
    // path. Prisma can't reliably query JSON criteria across DB engines, so we
    // scan the (small) per-site rule set in memory.
    const scope = data.connectorInstanceId ?? null;
    const existing = await queryAllSiteClients(siteId, (db) => db.alertRule.findMany({ where: { siteId } }));
    const dup = existing.find((r: any) => {
      const c = (r.criteria ?? {}) as RuleCriteria;
      return (
        (r.connectorInstanceId ?? null) === scope &&
        c.metricFamily === data.criteria.metricFamily &&
        c.metric === data.criteria.metric
      );
    });
    if (dup) {
      const e: any = new Error(
        `This alert is already configured${scope ? ' for the selected store' : ''}. Edit the existing rule instead of creating a new one.`
      );
      e.code = 'DUPLICATE_RULE';
      throw e;
    }

    const id = crypto.randomUUID();
    const now = new Date();
    // A store-scoped rule lands in its store's DB; a project-wide rule in the
    // site's primary store DB (control DB when the data plane is off).
    const db = await getScopedClient(siteId, data.connectorInstanceId ?? null);
    const row = await db.alertRule.create({
      data: {
        id,
        siteId,
        connectorInstanceId: data.connectorInstanceId ?? null,
        name: data.name,
        description: data.description ?? null,
        severity: data.severity,
        enabled: data.enabled ? 1 : 0,
        cooldownMinutes: data.cooldownMinutes,
        criteria: data.criteria as any,
        createdAt: now,
        updatedAt: now,
      },
    });
    return this.serialize(row);
  }

  static async update(siteId: string, id: string, input: AlertRuleInput) {
    const data = alertRuleInputSchema.parse(input);
    const found = await findInSiteClients(siteId, (db) => db.alertRule.findFirst({ where: { id, siteId } }));
    if (!found) return null;

    // Updated in place on the DB that already holds the rule. (Re-scoping a rule
    // to a different store changes only the column, not the physical DB — a rare
    // case in the common single-store-per-site setup.)
    const row = await found.client.alertRule.update({
      where: { id },
      data: {
        connectorInstanceId: data.connectorInstanceId ?? null,
        name: data.name,
        description: data.description ?? null,
        severity: data.severity,
        enabled: data.enabled ? 1 : 0,
        cooldownMinutes: data.cooldownMinutes,
        criteria: data.criteria as any,
        updatedAt: new Date(),
      },
    });
    return this.serialize(row);
  }

  static async setEnabled(siteId: string, id: string, enabled: boolean) {
    const found = await findInSiteClients(siteId, (db) => db.alertRule.findFirst({ where: { id, siteId } }));
    if (!found) return null;
    const row = await found.client.alertRule.update({
      where: { id },
      data: { enabled: enabled ? 1 : 0, updatedAt: new Date() },
    });
    return this.serialize(row);
  }

  static async remove(siteId: string, id: string) {
    const found = await findInSiteClients(siteId, (db) => db.alertRule.findFirst({ where: { id, siteId } }));
    if (!found) return false;
    await found.client.alertRule.delete({ where: { id } });
    return true;
  }
}
