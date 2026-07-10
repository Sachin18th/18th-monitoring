import { prisma } from '@kpi-platform/db';
import crypto from 'crypto';
import { AlertRuleInput, alertRuleInputSchema, RuleCriteria } from '../utils/alerting/rule-criteria';

/**
 * DB-backed CRUD for alert rules. This is the source of truth that the Alert
 * Center config UI writes to and the AlertEngine reads from. Rules live in the
 * `alert_rules` table; the configurable condition + recipients live in the
 * `criteria` JSON column.
 */
export class AlertRuleService {
  private static toBool(v: unknown): boolean {
    return v === 1 || v === true;
  }

  private static serialize(row: any) {
    return {
      id: row.id,
      siteId: row.siteId,
      tenantId: row.tenantId,
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

  static async list(siteId: string) {
    const rows = await prisma.alertRule.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r: any) => this.serialize(r));
  }

  static async get(siteId: string, id: string) {
    const row = await prisma.alertRule.findFirst({ where: { id, siteId } });
    return row ? this.serialize(row) : null;
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
    const existing = await prisma.alertRule.findMany({ where: { siteId } });
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
    const row = await prisma.alertRule.create({
      data: {
        id,
        siteId,
        tenantId,
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
    const existing = await prisma.alertRule.findFirst({ where: { id, siteId } });
    if (!existing) return null;

    const row = await prisma.alertRule.update({
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
    const existing = await prisma.alertRule.findFirst({ where: { id, siteId } });
    if (!existing) return null;
    const row = await prisma.alertRule.update({
      where: { id },
      data: { enabled: enabled ? 1 : 0, updatedAt: new Date() },
    });
    return this.serialize(row);
  }

  static async remove(siteId: string, id: string) {
    const existing = await prisma.alertRule.findFirst({ where: { id, siteId } });
    if (!existing) return false;
    await prisma.alertRule.delete({ where: { id } });
    return true;
  }
}
