import { prisma } from '@kpi-platform/db';
import { getScopedClient, getSiteDataPlaneClients } from '../lib/tenant-prisma';
import { Alert, AlertRule, AlertSeverity, AlertStatus } from '../utils/alerting/types';
import { RuleCriteria } from '../utils/alerting/rule-criteria';
import { AlertRuleService } from './alert-rule.service';
import { NotificationService } from './notification.service';
import { StorefrontTrackingService } from './storefront-tracking.service';
import { PaymentGatewayService } from './payment-gateway.service';
import { SmsGatewayService } from './sms-gateway.service';
import crypto from 'crypto';

export class AlertEngine {
  // Legacy in-memory rules used by the event-driven evaluateEvent() path.
  // Project-level (scheduled) evaluation now uses DB-backed rules instead.
  private static rules: AlertRule[] = [
    {
      id: 'rule_1',
      name: 'High API Error Rate',
      signalSource: 'api',
      condition: { metric: 'status_5xx', operator: '>', threshold: 5, windowMinutes: 5 },
      severity: AlertSeverity.CRITICAL,
      enabled: true
    },
    {
      id: 'rule_2',
      name: 'Checkout Funnel Drop',
      signalSource: 'journey',
      condition: { metric: 'checkout_abandonment', operator: '>', threshold: 50, windowMinutes: 10 },
      severity: AlertSeverity.HIGH,
      enabled: true
    },
    {
      id: 'rule_3',
      name: 'Synthetic Failure',
      signalSource: 'synthetic',
      condition: { metric: 'fail_count', operator: '>', threshold: 0, windowMinutes: 1 },
      severity: AlertSeverity.HIGH,
      enabled: true
    }
  ];

  static async evaluateEvent(event: any): Promise<Alert | null> {
    // 1. Filter rules for the signal source
    const relevantRules = this.rules.filter(r => r.signalSource === this.mapEventTypeToSource(event.eventType) && r.enabled);

    for (const rule of relevantRules) {
      if (this.checkCondition(rule, event)) {
        return {
          id: crypto.randomUUID(),
          ruleId: rule.id,
          title: rule.name,
          severity: rule.severity,
          status: AlertStatus.ACTIVE,
          timestamp: new Date().toISOString(),
          message: `Threshold breached: ${rule.condition.metric} ${rule.condition.operator} ${rule.condition.threshold}`,
          siteId: event.siteId,
          evidence: event.metadata
        };
      }
    }

    return null;
  }

  /**
   * Scheduled, project-level evaluation. Loads the user-configured alert rules
   * from the database, computes each rule's metric over its window, and raises
   * (+ notifies) an Alert when a threshold is breached and the rule isn't in
   * its cooldown period.
   */
  private static readonly OPEN_STATUSES = ['TRIGGERED', 'ACTIVE', 'ACKNOWLEDGED'];

  // In-flight evaluation per site. The Alert Center polls /alerts every 30s and
  // the scheduler runs every 5 min — without this, those overlapping calls race
  // the cooldown check and each create a duplicate alert + send a duplicate
  // email. Coalescing concurrent callers onto a single run makes the cooldown
  // check reliable, so a breach yields exactly one alert (and one email).
  private static readonly inflight = new Map<string, Promise<void>>();

  static evaluateProject(siteId: string, tenantId: string): Promise<void> {
    const existing = this.inflight.get(siteId);
    if (existing) return existing;
    const run = this.runEvaluateProject(siteId, tenantId).finally(() => this.inflight.delete(siteId));
    this.inflight.set(siteId, run);
    return run;
  }

  private static async runEvaluateProject(siteId: string, tenantId: string) {
    let rules;
    try {
      rules = await AlertRuleService.list(siteId);
    } catch (err: any) {
      console.error(`[AlertEngine] Failed to load rules for ${siteId}:`, err?.message);
      return;
    }

    for (const rule of rules.filter((r) => r.enabled)) {
      await this.evaluateRule(siteId, tenantId, rule);
    }
  }

  /**
   * Evaluate a single DB-backed rule: compute its metric over the window, then
   * resolve / hold / raise an alert as the condition dictates.
   *
   * `ignoreCooldown` lets callers force a fresh evaluation regardless of the
   * cooldown window — used right after a rule is edited so the Alert Center
   * reflects the NEW condition immediately instead of waiting out the cooldown
   * of the (now-resolved) alert raised under the old condition.
   */
  static async evaluateRule(
    siteId: string,
    tenantId: string,
    rule: any,
    opts: { ignoreCooldown?: boolean } = {},
  ) {
    try {
      const criteria = rule.criteria;
      if (!criteria || !criteria.metricFamily) return;

      // A rule scoped to a connector evaluates only that store's metrics;
      // a project-wide rule (null) evaluates across all of the site's data.
      const connectorInstanceId = rule.connectorInstanceId ?? null;

      // Alerts are store-payload data: raise/resolve them in the same store DB
      // the rule is scoped to (site's primary store DB for project-wide rules;
      // control DB when the data plane is off).
      const alertDb = await getScopedClient(siteId, connectorInstanceId);

      const alertType = `rule:${rule.id}`;
      const openStatuses = AlertEngine.OPEN_STATUSES;

      // `meta.detail` lets a metric annotate the alert with which specific
      // page / connector / gateway breached, so the email is actionable.
      const meta: { detail?: string } = {};
      const value = await this.computeMetricValue(siteId, criteria, connectorInstanceId, tenantId, meta);
      if (value === null) return; // no data in window → nothing to assert

      // Condition no longer breached → auto-resolve any open alert for this
      // rule so recovered problems stop lingering in the Alert Center.
      if (!this.compare(value, criteria.operator, criteria.threshold)) {
        await alertDb.alert.updateMany({
          where: { siteId, alertType, status: { in: openStatuses } },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
        return;
      }

      // Cooldown: don't re-fire the same rule within its cooldown window.
      // While in cooldown the existing open alert stays as-is (it's the
      // current active signal) — we just don't create a duplicate.
      if (!opts.ignoreCooldown) {
        const cooldownMs = (rule.cooldownMinutes ?? 60) * 60_000;
        const recent = await alertDb.alert.findFirst({
          where: { siteId, alertType, triggeredAt: { gte: new Date(Date.now() - cooldownMs) } },
          orderBy: { triggeredAt: 'desc' },
        });
        if (recent) return;
      }

      // Cooldown has elapsed (or is bypassed) and the condition is still
      // breached → supersede any stale open alert for this rule (resolve it)
      // before raising a fresh one, so the Alert Center shows a single current
      // alert per rule rather than a growing stack of past triggers.
      await alertDb.alert.updateMany({
        where: { siteId, alertType, status: { in: openStatuses } },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });

      const rounded = this.round(value);
      const message =
        `${rule.name}: ${criteria.metric} is ${rounded} (threshold ${criteria.operator} ${criteria.threshold})` +
        (meta.detail ? ` — ${meta.detail}` : '');
      const alertId = crypto.randomUUID();

      await alertDb.alert.create({
        data: {
          id: alertId,
          siteId,
          tenantId,
          // Stamp the originating store so the store-scoped Alert Center
          // filter surfaces this alert (null = project-wide, shown for all).
          connectorInstanceId,
          severity: rule.severity,
          status: 'TRIGGERED',
          module: criteria.metricFamily,
          alertType,
          message,
          // Everything the project summary email needs to render this alert.
          // Recipients + cadence are NO LONGER stored per-alert; they live in
          // project-level settings (ProjectSettingsService).
          context: {
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            metric: criteria.metric,
            metricFamily: criteria.metricFamily,
            value: rounded,
            threshold: criteria.threshold,
            operator: criteria.operator,
            windowMinutes: criteria.windowMinutes,
            detail: meta.detail ?? null,
          } as any,
        },
      });

      // Delivery is project-level: every alert is rolled into the periodic
      // summary email. CRITICAL alerts additionally fire an instant email when
      // the project has that enabled (they still appear in the next summary).
      if (String(rule.severity).toUpperCase() === 'CRITICAL') {
        await NotificationService.notifyCriticalImmediate(siteId, {
          ruleName: rule.name,
          severity: rule.severity,
          message,
          metric: criteria.metric,
          metricFamily: criteria.metricFamily,
          value: rounded,
          threshold: criteria.threshold,
          operator: criteria.operator,
          windowMinutes: criteria.windowMinutes,
        });
      }
    } catch (err: any) {
      console.error(`[AlertEngine] Rule ${rule.id} (${rule.name}) failed:`, err?.message);
    }
  }

  /**
   * Resolve every open alert raised by a rule. Used when a rule is edited,
   * disabled or deleted: the open alerts were raised under the OLD config and
   * must not keep lingering (or, for disable/delete, ever re-surface) in the
   * Alert Center. Resolving them also drops their un-sent digest entries, since
   * NotificationService.flushDigests only sweeps open alerts.
   */
  static async resolveAlertsForRule(siteId: string, ruleId: string): Promise<number> {
    // The rule's alerts live in one of the site's store DBs; sweep all of them
    // (a no-op on the DBs that hold none). Control DB when the data plane is off.
    const clients = await getSiteDataPlaneClients(siteId);
    let count = 0;
    for (const db of clients) {
      const res = await db.alert.updateMany({
        where: { siteId, alertType: `rule:${ruleId}`, status: { in: AlertEngine.OPEN_STATUSES } },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      count += res.count;
    }
    return count;
  }

  /**
   * Called after a rule's condition is edited. Clears alerts raised under the
   * old condition, then immediately re-evaluates the rule under the new one
   * (bypassing cooldown) so the Alert Center is filtered on the updated rule
   * right away instead of waiting for the next scheduled cycle.
   */
  static async handleRuleChanged(siteId: string, tenantId: string, ruleId: string) {
    const rule = await AlertRuleService.get(siteId, ruleId);
    if (!rule) return;

    await this.resolveAlertsForRule(siteId, ruleId);

    // A disabled rule shouldn't raise anything — clearing above is enough.
    if (!rule.enabled) return;

    await this.evaluateRule(siteId, tenantId, rule, { ignoreCooldown: true });
  }

  /**
   * Computes the current value of a rule's metric over its time window.
   * Returns null when there's no data to evaluate.
   */
  private static async computeMetricValue(
    siteId: string,
    criteria: RuleCriteria,
    connectorInstanceId: string | null = null,
    tenantId: string = '',
    meta: { detail?: string } = {},
  ): Promise<number | null> {
    const windowStart = new Date(Date.now() - criteria.windowMinutes * 60_000);
    // When the rule is scoped to a store, fold the connector into every metric
    // query; when project-wide (null), omit it so all connectors are included.
    const connectorWhere = connectorInstanceId ? { connectorInstanceId } : {};

    // Store-payload metrics (orders, storefront errors/sessions, performance)
    // now live in the store DB — read them from the scoped store client (the
    // connector's DB, or the site's primary store DB for project-wide rules;
    // control DB when the data plane is off). Only resolve it for families that
    // read payload: the `integration` case (connector_instances /
    // connector_sync_runs) is control-plane, and payment/sms probe external
    // services — resolving a (fail-closed) store client for those would break
    // their rules while a store's DB is still provisioning.
    const needsStoreDb =
      criteria.metricFamily === 'pagespeed' ||
      criteria.metricFamily === 'rum_errors' ||
      criteria.metricFamily === 'orders' ||
      (criteria.metricFamily === 'customer_session' && criteria.metric === 'avg_session_duration');
    const db = needsStoreDb ? await getScopedClient(siteId, connectorInstanceId) : prisma;

    switch (criteria.metricFamily) {
      case 'pagespeed': {
        // PageSpeed stores one row per (page type × device) under distinct
        // `source` values: overall (pagespeed_api:<device>) and per page
        // (pagespeed_page:<device>:homepage|pdp|plp|checkout). Averaging them
        // hides a slow page behind fast ones, so instead we check EVERY source
        // and breach on the WORST one — direction-aware so it matches the rule:
        //   'above' (lcp/ttfb/cls/tbt)  → the slowest page (max)
        //   'below' (score)             → the worst-scoring page (min)
        const rows = await db.performanceMetric.findMany({
          where: {
            siteId,
            ...connectorWhere,
            metricName: criteria.metric,
            source: { startsWith: 'pagespeed' },
            timestamp: { gte: windowStart },
          },
          orderBy: { timestamp: 'desc' },
          select: { metricValue: true, source: true },
        });

        // Latest value per source; skip the -1 "page unavailable" sentinel.
        // Track the WORST-scoring source so the alert can name the offending
        // page (e.g. "worst page: pdp (mobile)") instead of just a number.
        const seen = new Set<string>();
        const isBelow = criteria.operator === '<' || criteria.operator === '<=';
        let worst: { value: number; source: string } | null = null;
        for (const r of rows) {
          if (seen.has(r.source)) continue;
          seen.add(r.source);
          const v = Number(r.metricValue);
          if (v < 0) continue;
          if (!worst || (isBelow ? v < worst.value : v > worst.value)) {
            worst = { value: v, source: r.source };
          }
        }
        if (!worst) return null;

        meta.detail = `worst page: ${this.pagespeedSourceLabel(worst.source)}`;
        return worst.value;
      }

      case 'rum_errors': {
        // Storefront error counts over the window, narrowed by the kind of
        // error the rule cares about. Mirrors the tracker's error_type values
        // (js_error / promise_rejection / network_error / resource_error) and
        // the checkout page_type.
        const base = { projectId: siteId, ...connectorWhere, occurredAt: { gte: windowStart } } as any;
        switch (criteria.metric) {
          case 'js_errors':
            return db.storefrontError.count({
              where: { ...base, errorType: { in: ['js_error', 'promise_rejection'] } },
            });
          case 'network_errors':
            return db.storefrontError.count({ where: { ...base, errorType: 'network_error' } });
          case 'resource_errors':
            return db.storefrontError.count({ where: { ...base, errorType: 'resource_error' } });
          case 'checkout_errors':
            return db.storefrontError.count({ where: { ...base, pageType: 'checkout' } });
          case 'error_count':
          default:
            return db.storefrontError.count({ where: base });
        }
      }

      case 'orders': {
        // Use live CanonicalOrder data so the rule fires even when no
        // kpiValue snapshot exists (e.g. "order_count < 1 → 0 orders = fires").
        if (criteria.metric === 'order_count') {
          return db.canonicalOrder.count({
            where: { siteId, ...connectorWhere, placedAt: { gte: windowStart } },
          });
        }
        // Orders stuck in a pre-fulfilment state — the "delayed orders" signal.
        if (criteria.metric === 'delayed_orders') {
          return db.canonicalOrder.count({
            where: {
              siteId,
              ...connectorWhere,
              placedAt: { gte: windowStart },
              lifecycleState: { in: ['PLACED', 'PROCESSING', 'PENDING', 'ON_HOLD'] },
            },
          });
        }
        // Orders that failed, were cancelled, returned or refunded — "critical failures".
        if (criteria.metric === 'failed_orders') {
          return db.canonicalOrder.count({
            where: {
              siteId,
              ...connectorWhere,
              placedAt: { gte: windowStart },
              lifecycleState: {
                in: ['CANCELLED', 'CANCELED', 'FAILED', 'RETURNED', 'REFUNDED', 'REJECTED', 'DEAD_LETTERED'],
              },
            },
          });
        }
        if (criteria.metric === 'revenue') {
          const agg = await db.canonicalOrder.aggregate({
            where: { siteId, ...connectorWhere, placedAt: { gte: windowStart } },
            _sum: { totalAmount: true },
          });
          return agg._sum.totalAmount == null ? 0 : Number(agg._sum.totalAmount);
        }
        if (criteria.metric === 'aov') {
          const count = await db.canonicalOrder.count({
            where: { siteId, ...connectorWhere, placedAt: { gte: windowStart } },
          });
          if (count === 0) return null; // AOV undefined with 0 orders
          const agg = await db.canonicalOrder.aggregate({
            where: { siteId, ...connectorWhere, placedAt: { gte: windowStart } },
            _sum: { totalAmount: true },
          });
          return agg._sum.totalAmount == null ? null : Number(agg._sum.totalAmount) / count;
        }
        // Fallback: try kpiValue snapshot
        // kpiValue table removed — query neutralized
        const row = null as any;
        return row ? Number(row.kpiValue) : null;
      }

      case 'customer_session': {
        // Visitor metrics MUST match the Journey Intel page, which is computed
        // from storefront_sessions/storefront_events (NOT the customer_sessions
        // table). Reuse StorefrontTrackingService.journeyIntel so the alert and
        // the UI can never disagree.
        const ids = await this.storefrontConnectorIds(siteId, connectorInstanceId);
        if (!ids.length) return null;

        // avg_session_duration isn't part of journeyIntel — derive it directly
        // from the same storefront_sessions rows (last_active - started).
        if (criteria.metric === 'avg_session_duration') {
          return this.avgStorefrontSessionDuration(db, ids, windowStart);
        }

        const intel = await StorefrontTrackingService.journeyIntel({
          connectorInstanceIds: ids,
          from: windowStart,
          to: new Date(),
        });
        const sessions = this.funnelCount(intel, 'visit');

        if (criteria.metric === 'session_count') return sessions;
        if (criteria.metric === 'conversion_rate') {
          // overall_conversion = purchases / visits — undefined with no sessions.
          return sessions > 0 ? intel.sessionIntelligence.rates.overall_conversion : null;
        }
        return null;
      }

      case 'journey': {
        // Same authoritative source + same funnel counts as the Journey Intel
        // page (storefront_sessions, merged with synced order purchases for
        // off-domain checkouts), so the numbers line up exactly.
        const ids = await this.storefrontConnectorIds(siteId, connectorInstanceId);
        if (!ids.length) return null;

        const intel = await StorefrontTrackingService.journeyIntel({
          connectorInstanceIds: ids,
          from: windowStart,
          to: new Date(),
        });

        // completion_rate matches the Journey Intel page's headline "Completion
        // Rate" donut: purchases ÷ visits (end-to-end conversion). journeyIntel
        // already exposes this exact figure as overall_conversion, so the alert
        // and the page can never disagree.
        if (criteria.metric === 'completion_rate') {
          const visit = this.funnelCount(intel, 'visit');
          if (visit === 0) return null; // no visits → completion undefined
          return intel.sessionIntelligence.rates.overall_conversion;
        }

        // checkout_abandonment uses the checkout denominator — matching the
        // page's "Checkout Abandonment" tile: (checkout − purchase) ÷ checkout.
        const checkout = this.funnelCount(intel, 'checkout');
        const purchase = this.funnelCount(intel, 'purchase');
        if (checkout === 0) return null; // no checkout sessions → undefined
        return ((checkout - purchase) / checkout) * 100;
      }

      case 'integration': {
        // "Integration fail" — a store connector is failing. Two angles:
        //   unhealthy_connectors → connectors whose latest API health probe is
        //                          not OK (unreachable / auth-failed / degraded),
        //                          read from the mirrored ConnectorInstance state.
        //   sync_failures        → data-sync runs that FAILED / DEAD_LETTERED in
        //                          the window (always fresh, no probe needed).
        if (criteria.metric === 'unhealthy_connectors') {
          const bad = await prisma.connectorInstance.findMany({
            where: {
              siteId,
              disconnectedAt: null,
              ...(connectorInstanceId ? { id: connectorInstanceId } : {}),
              healthStatus: { in: ['DEGRADED', 'CRITICAL'] },
            },
            select: { label: true, providerId: true, healthStatus: true },
          });
          if (bad.length) {
            meta.detail = `failing: ${bad
              .map((c) => `${c.label || c.providerId} (${c.healthStatus})`)
              .join(', ')}`;
          }
          return bad.length;
        }
        // sync_failures (default)
        const failed = await prisma.connectorSyncRun.count({
          where: {
            startedAt: { gte: windowStart },
            status: { in: ['FAILED', 'DEAD_LETTERED'] },
            connectorInstance: {
              siteId,
              ...(connectorInstanceId ? { id: connectorInstanceId } : {}),
            },
          },
        });
        return failed;
      }

      case 'payment_gateway': {
        // Count configured payment gateways whose latest recorded status is
        // down or degraded. Snapshots are refreshed by the scheduled cycle (and
        // on dashboard/journey reads); we read the latest here.
        if (!tenantId) return null;
        const snaps = await PaymentGatewayService.getLatestGatewaySnapshots(siteId, tenantId);
        if (!snaps.length) return null; // no gateways configured → nothing to assert
        const bad = snaps.filter((s) => s.status === 'DOWN' || s.status === 'DEGRADED');
        if (bad.length) {
          meta.detail = `impacted: ${bad.map((b) => `${b.label} (${b.status})`).join(', ')}`;
        }
        return bad.length;
      }

      case 'sms_gateway': {
        // Live probe of the SMS providers' public status pages. Provider health
        // is global (not per-store), so this ignores the connector scope.
        // 'minor' = degraded, 'major'/'critical' = down; 'unknown' is ignored so
        // a transient probe failure can't raise a false alarm.
        const statuses = await SmsGatewayService.getAllStatuses();
        const bad = statuses.filter(
          (s) => s.indicator === 'minor' || s.indicator === 'major' || s.indicator === 'critical',
        );
        if (bad.length) {
          meta.detail = `impacted: ${bad.map((b) => `${b.displayName} (${b.description})`).join(', ')}`;
        }
        return bad.length;
      }

      default:
        return null;
    }
  }

  /** Human label for a PageSpeed `source` value (page type + device). */
  private static pagespeedSourceLabel(source: string): string {
    // Formats: `pagespeed_api:<device>` (overall) · `pagespeed_page:<device>:<pageType>`
    const parts = source.split(':');
    if (source.startsWith('pagespeed_page')) {
      const device = parts[1] || 'device';
      const pageType = parts[2] || 'page';
      return `${pageType} (${device})`;
    }
    const device = parts[1] || 'device';
    return `homepage / overall (${device})`;
  }

  /** Connector instances for a site, or just the rule's connector when scoped. */
  private static async storefrontConnectorIds(
    siteId: string,
    connectorInstanceId: string | null,
  ): Promise<string[]> {
    if (connectorInstanceId) return [connectorInstanceId];
    const rows = await prisma.connectorInstance.findMany({ where: { siteId }, select: { id: true } });
    return rows.map((i) => i.id);
  }

  /** Pull a canonical-stage count out of a journeyIntel funnel result. */
  private static funnelCount(intel: { funnel: Array<{ canonical_stage: string; count: number }> }, stage: string): number {
    return intel.funnel.find((f) => f.canonical_stage === stage)?.count ?? 0;
  }

  /** Average storefront session duration (seconds) over the window. */
  private static async avgStorefrontSessionDuration(db: any, ids: string[], windowStart: Date): Promise<number | null> {
    const rows: Array<{ avg_seconds: number | null }> = await db.$queryRawUnsafe(
      `SELECT AVG(EXTRACT(EPOCH FROM (last_active_at - started_at)))::float8 AS avg_seconds
         FROM storefront_sessions
        WHERE connector_instance_id = ANY($1::text[])
          AND started_at >= $2`,
      ids,
      windowStart,
    );
    const v = rows[0]?.avg_seconds;
    return v == null ? null : Number(v);
  }

  private static compare(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      default: return false;
    }
  }

  private static round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private static mapEventTypeToSource(type: string): string {
    if (type === 'backend_performance') return 'api';
    if (type === 'js_error' || type === 'business_failure') return 'failure';
    if (type === 'funnel_step' || type === 'interaction_signal') return 'journey';
    if (type === 'synthetic_run') return 'synthetic';
    return 'rum';
  }

  private static checkCondition(rule: AlertRule, event: any): boolean {
    // Simple evaluation logic for the event-driven simulation path.
    if (rule.signalSource === 'api' && event.metadata.status >= 500) return true;
    if (rule.signalSource === 'synthetic' && event.metadata.status === 'FAIL') return true;
    if (rule.signalSource === 'failure' && event.eventType === 'js_error') return true;
    return false;
  }
}
