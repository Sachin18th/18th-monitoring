import nodemailer, { Transporter } from 'nodemailer';
import { prisma } from '@kpi-platform/db';
import { queryAllSiteClients } from '../lib/tenant-prisma';
import { Alert, AlertSeverity } from '../utils/alerting/types';
import { ProjectSettingsService } from './project-settings.service';

/** Minimal detail needed to render a single-alert immediate email. */
interface ImmediateAlert {
  ruleName: string;
  severity: string;
  message: string;
  metric: string;
  metricFamily: string;
  value: number;
  threshold: number;
  operator: string;
  windowMinutes: number;
}

/** Normalized row used to render one alert line in an email. */
interface AlertEmailRow {
  severity: string;
  rule: string;
  metric: string;
  metricFamily: string;
  value: number | string | null | undefined;
  operator: string;
  threshold: number | string | null | undefined;
  windowMinutes?: number;
  message?: string;
}

export class NotificationService {
  private static transporter: Transporter | null = null;

  /** Outbound sending is gated so dev environments just log instead of emailing. */
  private static get enabled(): boolean {
    return process.env.ENABLE_OUTBOUND_NOTIFICATIONS === 'true';
  }

  private static getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      console.warn('[NotificationService] SMTP env not configured (SMTP_HOST/SMTP_USER/SMTP_PASS) — emails will be logged only.');
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: { user, pass },
    });
    return this.transporter;
  }

  private static async sendEmail(
    to: string[],
    subject: string,
    html: string,
    text: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    if (!to.length) {
      console.log(`[NotificationService] Skipped "${subject}" — no recipients.`);
      return { sent: false, reason: 'no recipients' };
    }

    if (!this.enabled) {
      console.log(`[NotificationService] (disabled) would email ${to.join(', ')} | ${subject}`);
      return { sent: false, reason: 'outbound disabled (ENABLE_OUTBOUND_NOTIFICATIONS != true)' };
    }

    const transporter = this.getTransporter();
    // Most SMTP relays reject a From that isn't the authenticated mailbox/domain,
    // so fall back through the configured sender addresses before the local stub.
    const from =
      process.env.ALERT_FROM_EMAIL ||
      process.env.EMAIL_FROM ||
      process.env.FROM_EMAIL ||
      process.env.SMTP_USER ||
      'alerts@kpi-monitoring.local';
    if (!transporter) {
      console.log(`[NotificationService] (no transport) would email ${to.join(', ')} | ${subject}`);
      return { sent: false, reason: 'no SMTP transport (SMTP_HOST/USER/PASS missing)' };
    }

    try {
      await transporter.sendMail({ from, to, subject, text, html });
      console.log(`[NotificationService] ✉️  Sent "${subject}" to ${to.join(', ')}`);
      return { sent: true };
    } catch (err: any) {
      console.error(`[NotificationService] Failed to send email: ${err?.message}`);
      return { sent: false, reason: err?.message || 'send failed' };
    }
  }

  /**
   * Send a one-off test email to the project's configured recipients so an
   * operator can verify SMTP delivery on demand (no real alert required).
   * Returns the outcome so the API can surface it in the UI.
   */
  static async sendTestEmail(siteId: string): Promise<{ sent: boolean; recipients: string[]; reason?: string }> {
    const settings = await ProjectSettingsService.getAlertNotifications(siteId);
    if (!settings.recipients.length) {
      return { sent: false, recipients: [], reason: 'No recipients configured in Notification settings.' };
    }

    const subject = `[Test] ${this.BRAND} — email delivery check`;
    const text =
      `This is a test email from ${this.BRAND}.\n\n` +
      `If you received this, your alert recipients and SMTP settings are configured correctly — real alerts will be delivered here.\n\n` +
      `View in Alert Center: ${this.dashboardLink(siteId)}`;
    const html = this.wrapEmail({
      siteId,
      heading: 'Test email delivered successfully',
      subhead: 'Recipients & SMTP check',
      accent: '#16a34a',
      ctaLabel: 'Open Alert Center',
      innerHtml:
        `<p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">` +
        `If you're reading this, your alert recipients and SMTP settings are configured correctly. ` +
        `Real alerts for this project will arrive here in the same format.</p>`,
    });

    const res = await this.sendEmail(settings.recipients, subject, html, text);
    return { sent: res.sent, recipients: settings.recipients, reason: res.reason };
  }

  private static escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Email templating — a single professional, email-client-safe shell used by
  //  every outbound alert mail (summary, critical, test). Inline styles + a
  //  table layout so it renders consistently in Gmail / Outlook / Thunderbird.
  // ─────────────────────────────────────────────────────────────────────────

  private static readonly BRAND = process.env.ALERT_BRAND_NAME || 'KPI Monitoring';

  /** Absolute Alert Center link (relative paths don't work inside an inbox). */
  private static dashboardLink(siteId: string): string {
    const base = String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    const path = `/project/${siteId}/observability/alerts`;
    return base ? `${base}${path}` : path;
  }

  /** Brand/badge colours per severity. */
  private static severityPalette(severity: string): { bg: string; fg: string; accent: string } {
    switch (String(severity).toUpperCase()) {
      case 'CRITICAL': return { bg: '#FEE2E2', fg: '#B91C1C', accent: '#DC2626' };
      case 'HIGH':     return { bg: '#FFEDD5', fg: '#C2410C', accent: '#EA580C' };
      case 'MEDIUM':   return { bg: '#FEF9C3', fg: '#A16207', accent: '#CA8A04' };
      default:         return { bg: '#DBEAFE', fg: '#1D4ED8', accent: '#2563EB' };
    }
  }

  /** Outer HTML shell: branded header, accent strip, body slot, CTA, footer. */
  private static wrapEmail(opts: {
    siteId: string;
    heading: string;
    subhead?: string;
    accent: string;
    innerHtml: string;
    ctaLabel?: string;
  }): string {
    const link = this.dashboardLink(opts.siteId);
    const cta = opts.ctaLabel ?? 'View in Alert Center';
    return [
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>`,
      `<body style="margin:0;padding:0;background:#f4f5f7;">`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">`,
      `<tr><td align="center">`,
      `<table role="presentation" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">`,
      // header
      `<tr><td style="background:#0f172a;padding:18px 28px;">`,
      `<table role="presentation" width="100%"><tr>`,
      `<td style="font-size:16px;font-weight:700;color:#ffffff;letter-spacing:.02em;">${this.escapeHtml(this.BRAND)}</td>`,
      `<td align="right" style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;">Alert Notification</td>`,
      `</tr></table>`,
      `</td></tr>`,
      // accent strip
      `<tr><td style="height:4px;background:${opts.accent};font-size:0;line-height:0;">&nbsp;</td></tr>`,
      // title
      `<tr><td style="padding:26px 28px 6px;">`,
      `<h1 style="margin:0;font-size:20px;line-height:1.3;color:#0f172a;font-weight:700;">${this.escapeHtml(opts.heading)}</h1>`,
      opts.subhead ? `<p style="margin:6px 0 0;font-size:13px;color:#6b7280;">${this.escapeHtml(opts.subhead)}</p>` : '',
      `</td></tr>`,
      // body slot
      `<tr><td style="padding:18px 28px 4px;">${opts.innerHtml}</td></tr>`,
      // CTA
      `<tr><td style="padding:10px 28px 28px;">`,
      `<a href="${link}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:8px;">${this.escapeHtml(cta)} &rarr;</a>`,
      `</td></tr>`,
      // footer
      `<tr><td style="background:#f9fafb;border-top:1px solid #eef0f2;padding:16px 28px;">`,
      `<p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.5;">This is an automated message from ${this.escapeHtml(this.BRAND)} for project <span style="color:#6b7280">${this.escapeHtml(opts.siteId)}</span>. You're receiving it because your address is on the project's alert recipient list.</p>`,
      `</td></tr>`,
      `</table></td></tr></table></body></html>`,
    ].join('');
  }

  // ── Plain-language translation (so non-technical readers understand) ────────

  /** Friendly label + unit for each raw metric key. */
  private static readonly METRIC_META: Record<string, { label: string; unit: string }> = {
    // Site speed
    lcp: { label: 'Page load time', unit: 'ms' },
    ttfb: { label: 'Server response time', unit: 'ms' },
    cls: { label: 'Page layout stability', unit: '' },
    fid: { label: 'Input responsiveness', unit: 'ms' },
    tbt: { label: 'Page blocking time', unit: 'ms' },
    score: { label: 'Performance score', unit: '' },
    // Storefront errors
    error_count: { label: 'Storefront errors', unit: '' },
    js_errors: { label: 'JavaScript errors', unit: '' },
    network_errors: { label: 'Network errors', unit: '' },
    resource_errors: { label: 'Resource load errors', unit: '' },
    checkout_errors: { label: 'Checkout-page errors', unit: '' },
    // Orders
    revenue: { label: 'Revenue', unit: '' },
    order_count: { label: 'Orders received', unit: '' },
    aov: { label: 'Average order value', unit: '' },
    delayed_orders: { label: 'Delayed orders', unit: '' },
    failed_orders: { label: 'Failed / cancelled orders', unit: '' },
    // Visitors
    session_count: { label: 'Visitor sessions', unit: '' },
    conversion_rate: { label: 'Conversion rate', unit: '%' },
    avg_session_duration: { label: 'Average visit length', unit: 's' },
    // Journey
    checkout_abandonment: { label: 'Checkout abandonment', unit: '%' },
    completion_rate: { label: 'Checkout completion', unit: '%' },
  };

  private static metricMeta(metric: string): { label: string; unit: string } {
    return this.METRIC_META[metric] || { label: metric || 'Value', unit: '' };
  }

  /** "33.33%", "786 ms", "0" (count metrics carry the noun in the label). */
  private static fmtValue(value: number | string | null | undefined, unit: string): string {
    if (value == null) return '—';
    const n = typeof value === 'number' ? value : Number(value);
    const v = Number.isFinite(n) ? String(n) : String(value);
    if (unit === '%') return `${v}%`;
    return unit ? `${v} ${unit}` : v;
  }

  /** Turns the operator into a plain "healthy target" phrase. */
  private static healthyTarget(operator: string, threshold: string): string {
    if (operator === '<' || operator === '<=') return `should stay at or above ${threshold}`;
    if (operator === '>' || operator === '>=') return `should stay below ${threshold}`;
    return `should be ${threshold}`;
  }

  /** "last 24 hours", "last 1 hour", "last 15 minutes". */
  private static humanWindow(min?: number): string {
    if (!min || min <= 0) return '';
    if (min === 1440) return 'last 24 hours';
    if (min % 1440 === 0) return `last ${min / 1440} days`;
    if (min % 60 === 0) { const h = min / 60; return `last ${h} hour${h === 1 ? '' : 's'}`; }
    return `last ${min} minutes`;
  }

  /** Plain-text explanation of one alert reading. */
  private static plainReadingText(r: AlertEmailRow): string {
    if (r.value == null || !r.operator || r.threshold == null) return r.message || '';
    const meta = this.metricMeta(r.metric);
    const win = this.humanWindow(r.windowMinutes);
    return (
      `${meta.label} is ${this.fmtValue(r.value, meta.unit)} — ` +
      `${this.healthyTarget(r.operator, this.fmtValue(r.threshold, meta.unit))}` +
      (win ? ` (${win})` : '') + '.'
    );
  }

  /** HTML "details" cell: a plain-English reading anyone can understand. */
  private static readingHtml(r: AlertEmailRow): string {
    if (r.value == null || !r.operator || r.threshold == null) {
      return `<span style="color:#374151">${this.escapeHtml(String(r.message ?? '—'))}</span>`;
    }
    const meta = this.metricMeta(r.metric);
    const win = this.humanWindow(r.windowMinutes);
    return (
      `<span style="color:#111827;font-weight:600">${this.escapeHtml(`${meta.label} is ${this.fmtValue(r.value, meta.unit)}`)}</span>` +
      `<br><span style="color:#6b7280;font-size:12px">${this.escapeHtml(this.healthyTarget(r.operator, this.fmtValue(r.threshold, meta.unit)))}` +
      (win ? ` &middot; ${this.escapeHtml(win)}` : '') +
      `</span>`
    );
  }

  /** The alert table body shared by summary + single-alert emails. */
  private static alertTableHtml(rows: AlertEmailRow[]): string {
    const th = (label: string) =>
      `<th align="left" style="padding:0 14px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;font-weight:600;">${label}</th>`;
    const body = rows
      .map((r) => {
        const p = this.severityPalette(r.severity);
        return (
          `<tr>` +
          `<td style="padding:13px 14px;border-bottom:1px solid #eef0f2;border-left:3px solid ${p.accent};white-space:nowrap;">` +
          `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${p.bg};color:${p.fg};font-size:11px;font-weight:700;letter-spacing:.04em;">${this.escapeHtml(String(r.severity).toUpperCase())}</span>` +
          `</td>` +
          `<td style="padding:13px 14px;border-bottom:1px solid #eef0f2;">` +
          `<div style="font-size:14px;font-weight:600;color:#111827;">${this.escapeHtml(r.rule)}</div>` +
          `</td>` +
          `<td style="padding:13px 14px;border-bottom:1px solid #eef0f2;font-size:13px;">${this.readingHtml(r)}</td>` +
          `</tr>`
        );
      })
      .join('');
    return (
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">` +
      `<tr>${th('Severity')}${th('Alert')}${th('What’s happening')}</tr>` +
      `${body}</table>`
    );
  }

  /** Build subject/html/text for one or more alerts using the shared shell. */
  private static renderAlertEmail(siteId: string, rows: AlertEmailRow[]): { subject: string; html: string; text: string } {
    const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const norm = (s: string) => String(s || 'LOW').toUpperCase();
    const sorted = [...rows].sort((a, b) => (rank[norm(a.severity)] ?? 4) - (rank[norm(b.severity)] ?? 4));
    const count = sorted.length;

    const counts: Record<string, number> = {};
    for (const r of sorted) counts[norm(r.severity)] = (counts[norm(r.severity)] ?? 0) + 1;
    const breakdown = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
      .filter((s) => counts[s])
      .map((s) => `${counts[s]} ${s}`)
      .join(' · ');

    const top = norm(sorted[0]?.severity);
    const heading = `${count} alert${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} attention`;
    const subject = `[${top}] ${heading}`;

    const html = this.wrapEmail({
      siteId,
      heading,
      subhead: breakdown,
      accent: this.severityPalette(top).accent,
      innerHtml: this.alertTableHtml(sorted),
    });

    const text =
      `${heading}${breakdown ? ` (${breakdown})` : ''}\n\n` +
      sorted
        .map((r) => `• [${norm(r.severity)}] ${r.rule}: ${this.plainReadingText(r)}`)
        .join('\n') +
      `\n\nView in Alert Center: ${this.dashboardLink(siteId)}`;

    return { subject, html, text };
  }

  /**
   * Instant email for a CRITICAL alert, sent to the project's shared recipient
   * list — but only when the project has "email critical immediately" enabled.
   * The alert still appears in the next periodic summary. Recipients + the
   * toggle come from project settings, never from the rule itself.
   */
  static async notifyCriticalImmediate(siteId: string, alert: ImmediateAlert) {
    let settings;
    try {
      settings = await ProjectSettingsService.getAlertNotifications(siteId);
    } catch (err: any) {
      console.error(`[NotificationService] Failed to load notification settings for ${siteId}:`, err?.message);
      return;
    }

    if (!settings.immediateCritical || !settings.recipients.length) {
      console.log(
        `[NotificationService] CRITICAL "${alert.ruleName}" raised but immediate email skipped ` +
        `(immediateCritical=${settings.immediateCritical}, recipients=${settings.recipients.length}).`,
      );
      return;
    }

    const { html, text } = this.renderAlertEmail(siteId, [
      {
        severity: 'CRITICAL',
        rule: alert.ruleName,
        metric: alert.metric,
        metricFamily: alert.metricFamily,
        value: alert.value,
        operator: alert.operator,
        threshold: alert.threshold,
        windowMinutes: alert.windowMinutes,
        message: alert.message,
      },
    ]);
    // Single-alert immediate email names the rule in the subject (more actionable
    // than the generic "1 alert needs attention" the summary path uses).
    const subject = `[CRITICAL] ${alert.ruleName}`;

    await this.sendEmail(settings.recipients, subject, html, text);
  }

  /**
   * Periodic, project-level summary email.
   *
   * Replaces the old per-rule digest. On each scheduled cycle this checks the
   * project's notification settings: if the summary is enabled, has recipients,
   * and the chosen cadence (summaryMinutes) has elapsed since the last send, it
   * rolls EVERY open alert not yet summarized — across all rules — into ONE
   * email to the shared recipient list. Detection (per-rule windows) and
   * delivery (this cadence) are fully decoupled. Call on the scheduled cycle
   * only (never on read).
   */
  static async sendProjectSummary(siteId: string): Promise<number> {
    let settings;
    try {
      settings = await ProjectSettingsService.getAlertNotifications(siteId);
    } catch (err: any) {
      console.error(`[NotificationService] Failed to load notification settings for ${siteId}:`, err?.message);
      return 0;
    }

    if (!settings.summaryEnabled || !settings.recipients.length) {
      console.log(
        `[NotificationService] Summary skipped for ${siteId} ` +
        `(summaryEnabled=${settings.summaryEnabled}, recipients=${settings.recipients.length}).`,
      );
      return 0;
    }

    // Cadence gate: not due yet → nothing to do.
    const now = Date.now();
    const last = settings.lastSummaryAt ? new Date(settings.lastSummaryAt).getTime() : 0;
    if (last && now - last < settings.summaryMinutes * 60_000) {
      const waitMin = Math.ceil((settings.summaryMinutes * 60_000 - (now - last)) / 60_000);
      console.log(`[NotificationService] Summary for ${siteId} not due yet (~${waitMin} min to go).`);
      return 0;
    }

    // Snapshot of ALL currently-open alerts — every severity, in one email — so
    // the summary always reflects the full current state (not a per-batch slice).
    // Alerts are site-partitioned across the site's store DBs — sweep all of
    // them and merge (control DB when the data plane is off).
    const rows = (await queryAllSiteClients(siteId, (db) =>
      db.alert.findMany({
        where: { siteId, status: { in: ['TRIGGERED', 'ACTIVE'] } },
        orderBy: { triggeredAt: 'desc' },
        take: 500,
      }),
    )).sort((a: any, b: any) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()).slice(0, 500);

    if (!rows.length) {
      console.log(`[NotificationService] Summary for ${siteId} due but no active alerts.`);
      return 0;
    }

    // Change-detection: only re-send when the set of active alerts actually
    // changed since the last summary (a new alert appeared or one resolved).
    // This avoids re-emailing the identical snapshot every cadence while a
    // problem persists — reminders still come when cooldown re-raises an alert
    // (a new id → the signature changes).
    const signature = rows.map((a: any) => a.id).sort().join(',');
    if (signature === settings.lastSummarySignature) {
      console.log(`[NotificationService] Summary for ${siteId} unchanged since last send — skipping.`);
      return 0;
    }

    await this.sendSummaryEmail(settings.recipients, siteId, rows);

    const sentAt = new Date().toISOString();
    await ProjectSettingsService.markSummarySent(siteId, sentAt, signature);

    return rows.length;
  }

  /** Compose + send one consolidated summary email to all project recipients. */
  private static async sendSummaryEmail(recipients: string[], siteId: string, alerts: any[]) {
    const rows: AlertEmailRow[] = alerts.map((a) => {
      const c = (a.context as any) || {};
      return {
        severity: String(c.severity || a.severity || 'LOW').toUpperCase(),
        rule: c.ruleName || c.ruleId || 'Rule',
        metric: c.metric || '',
        metricFamily: c.metricFamily || '',
        value: c.value,
        operator: c.operator || '',
        threshold: c.threshold,
        windowMinutes: c.windowMinutes,
        message: a.message,
      };
    });

    const { subject, html, text } = this.renderAlertEmail(siteId, rows);
    await this.sendEmail(recipients, subject, html, text);
  }

  /**
   * Legacy event-driven dispatch (kept for existing ingestion callers).
   */
  static async notify(alert: Alert) {
    console.log(`[NotificationService] 🔔 Dispatching notification for Alert: ${alert.title} (${alert.severity})`);

    if (alert.severity === AlertSeverity.CRITICAL || alert.severity === AlertSeverity.HIGH) {
      this.sendToSlack(alert);
    }
    if (alert.severity === AlertSeverity.CRITICAL) {
      this.sendEmail(
        ['on-call@example.com'],
        `CRITICAL ALERT - ${alert.title}`,
        `<p>${alert.message}</p>`,
        alert.message,
      );
    }
    this.triggerWebhook(alert);
  }

  private static sendToSlack(alert: Alert) {
    console.log(`[Slack] [${alert.severity}] ALERT: ${alert.title} - ${alert.message} | Link: /project/${alert.siteId}/observability/alerts`);
  }

  private static triggerWebhook(alert: Alert) {
    console.log(`[Webhook] POST https://external-system.com/alerts | Payload: ${JSON.stringify({ id: alert.id, status: 'triggered' })}`);
  }
}
