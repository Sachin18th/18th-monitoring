import { prisma } from '@kpi-platform/db';
import { queryAllSiteClients } from '../lib/tenant-prisma';

/**
 * Project-level alert notification settings.
 *
 * These were previously duplicated inside every alert rule's `criteria`
 * (recipients + per-rule digest timing). They now live ONCE per project, in the
 * existing `projects.settings` JSON column (no schema migration), cleanly
 * separating "who to email & how often" (here) from "what to watch" (the rule).
 */
export interface AlertNotificationSettings {
  /** Shared recipient list for every alert this project raises. */
  recipients: string[];
  /** Master switch for the periodic summary email. */
  summaryEnabled: boolean;
  /** How often the consolidated summary email is sent, in minutes. */
  summaryMinutes: number;
  /** Email CRITICAL alerts the moment they fire (they still appear in the summary). */
  immediateCritical: boolean;
  /** Internal bookkeeping: when the last summary went out (ISO). Not user-set. */
  lastSummaryAt?: string | null;
  /** Internal: signature of the active-alert set in the last summary, so an
   *  unchanged set isn't emailed again. Not user-set. */
  lastSummarySignature?: string | null;
}

const DEFAULTS: AlertNotificationSettings = {
  recipients: [],
  summaryEnabled: true,
  summaryMinutes: 60,
  immediateCritical: true,
  lastSummaryAt: null,
  lastSummarySignature: null,
};

export class ProjectSettingsService {
  /**
   * Read the project's alert-notification settings. When the project has never
   * configured them, the recipient list is seeded from any emails still set on
   * existing rules so the migration to project-level recipients loses nothing.
   */
  static async getAlertNotifications(siteId: string): Promise<AlertNotificationSettings> {
    const settings = await this.readSettingsBag(siteId);
    const stored = (settings.alertNotifications && typeof settings.alertNotifications === 'object'
      ? settings.alertNotifications
      : null) as Partial<AlertNotificationSettings> | null;

    if (stored && Array.isArray(stored.recipients)) {
      return { ...DEFAULTS, ...stored, recipients: stored.recipients };
    }

    const seeded = await this.seedRecipientsFromRules(siteId);
    return { ...DEFAULTS, ...(stored || {}), recipients: seeded };
  }

  static async updateAlertNotifications(
    siteId: string,
    input: Partial<AlertNotificationSettings>,
  ): Promise<AlertNotificationSettings> {
    const current = await this.getAlertNotifications(siteId);
    const next: AlertNotificationSettings = {
      ...current,
      ...input,
      // Never let a caller overwrite internal bookkeeping via the public update.
      lastSummaryAt: current.lastSummaryAt ?? null,
      lastSummarySignature: current.lastSummarySignature ?? null,
      recipients: Array.isArray(input.recipients) ? input.recipients : current.recipients,
    };
    await this.persist(siteId, next);
    return next;
  }

  /**
   * Stamp when the last summary email was sent (gates the cadence) and the
   * signature of the active-alert set it covered (so an unchanged set isn't
   * re-emailed).
   */
  static async markSummarySent(siteId: string, at: string, signature: string): Promise<void> {
    const current = await this.getAlertNotifications(siteId);
    await this.persist(siteId, { ...current, lastSummaryAt: at, lastSummarySignature: signature });
  }

  // ── internals ──

  private static async readSettingsBag(siteId: string): Promise<Record<string, any>> {
    const project = await prisma.project.findUnique({ where: { id: siteId }, select: { settings: true } });
    return (project?.settings && typeof project.settings === 'object' ? project.settings : {}) as Record<string, any>;
  }

  private static async seedRecipientsFromRules(siteId: string): Promise<string[]> {
    // Rules are site-partitioned across the site's store DBs (control DB when the
    // data plane is off).
    const rules = await queryAllSiteClients<any>(siteId, (db) =>
      db.alertRule.findMany({ where: { siteId }, select: { criteria: true } }),
    );
    const set = new Set<string>();
    for (const r of rules) {
      const recs = (r.criteria as any)?.recipients;
      if (Array.isArray(recs)) {
        for (const e of recs) if (typeof e === 'string' && e.trim()) set.add(e.trim());
      }
    }
    return Array.from(set);
  }

  private static async persist(siteId: string, alertNotifications: AlertNotificationSettings): Promise<void> {
    const settings = await this.readSettingsBag(siteId);
    await prisma.project.update({
      where: { id: siteId },
      data: { settings: { ...settings, alertNotifications } as any, updatedAt: new Date() },
    });
  }
}
