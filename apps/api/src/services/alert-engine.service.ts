import { prisma } from '@kpi-platform/db';
import { Alert, AlertRule, AlertSeverity, AlertStatus } from '../utils/alerting/types';
import { RuleCriteria } from '../utils/alerting/rule-criteria';
import { AlertRuleService } from './alert-rule.service';
import { NotificationService } from './notification.service';
import { StorefrontTrackingService } from './storefront-tracking.service';
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

      const alertType = `rule:${rule.id}`;
      const openStatuses = AlertEngine.OPEN_STATUSES;

      const value = await this.computeMetricValue(siteId, criteria, connectorInstanceId);
      if (value === null) return; // no data in window → nothing to assert

      // Condition no longer breached → auto-resolve any open alert for this
      // rule so recovered problems stop lingering in the Alert Center.
      if (!this.compare(value, criteria.operator, criteria.threshold)) {
        await prisma.alert.updateMany({
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
        const recent = await prisma.alert.findFirst({
          where: { siteId, alertType, triggeredAt: { gte: new Date(Date.now() - cooldownMs) } },
          orderBy: { triggeredAt: 'desc' },
        });
        if (recent) return;
      }

      // Cooldown has elapsed (or is bypassed) and the condition is still
      // breached → supersede any stale open alert for this rule (resolve it)
      // before raising a fresh one, so the Alert Center shows a single current
      // alert per rule rather than a growing stack of past triggers.
      await prisma.alert.updateMany({
        where: { siteId, alertType, status: { in: openStatuses } },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });

      const rounded = this.round(value);
      const message = `${rule.name}: ${criteria.metric} is ${rounded} (threshold ${criteria.operator} ${criteria.threshold})`;
      const alertId = crypto.randomUUID();

      await prisma.alert.create({
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
    const res = await prisma.alert.updateMany({
      where: { siteId, alertType: `rule:${ruleId}`, status: { in: AlertEngine.OPEN_STATUSES } },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    return res.count;
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
  ): Promise<number | null> {
    const windowStart = new Date(Date.now() - criteria.windowMinutes * 60_000);
    // When the rule is scoped to a store, fold the connector into every metric
    // query; when project-wide (null), omit it so all connectors are included.
    const connectorWhere = connectorInstanceId ? { connectorInstanceId } : {};

    switch (criteria.metricFamily) {
      case 'pagespeed': {
        // PageSpeed stores one row per (page type × device) under distinct
        // `source` values: overall (pagespeed_api:<device>) and per page
        // (pagespeed_page:<device>:homepage|pdp|plp|checkout). Averaging them
        // hides a slow page behind fast ones, so instead we check EVERY source
        // and breach on the WORST one — direction-aware so it matches the rule:
        //   'above' (lcp/ttfb/cls/tbt)  → the slowest page (max)
        //   'below' (score)             → the worst-scoring page (min)
        const rows = await prisma.performanceMetric.findMany({
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
        const seen = new Set<string>();
        const values: number[] = [];
        for (const r of rows) {
          if (seen.has(r.source)) continue;
          seen.add(r.source);
          const v = Number(r.metricValue);
          if (v >= 0) values.push(v);
        }
        if (!values.length) return null;

        const isBelow = criteria.operator === '<' || criteria.operator === '<=';
        return isBelow ? Math.min(...values) : Math.max(...values);
      }

      case 'rum_errors': {
        // Storefront error counts over the window, narrowed by the kind of
        // error the rule cares about. Mirrors the tracker's error_type values
        // (js_error / promise_rejection / network_error / resource_error) and
        // the checkout page_type.
        const base = { projectId: siteId, ...connectorWhere, occurredAt: { gte: windowStart } } as any;
        switch (criteria.metric) {
          case 'js_errors':
            return prisma.storefrontError.count({
              where: { ...base, errorType: { in: ['js_error', 'promise_rejection'] } },
            });
          case 'network_errors':
            return prisma.storefrontError.count({ where: { ...base, errorType: 'network_error' } });
          case 'resource_errors':
            return prisma.storefrontError.count({ where: { ...base, errorType: 'resource_error' } });
          case 'checkout_errors':
            return prisma.storefrontError.count({ where: { ...base, pageType: 'checkout' } });
          case 'error_count':
          default:
            return prisma.storefrontError.count({ where: base });
        }
      }

      case 'orders': {
        // Use live CanonicalOrder data so the rule fires even when no
        // kpiValue snapshot exists (e.g. "order_count < 1 → 0 orders = fires").
        if (criteria.metric === 'order_count') {
          return prisma.canonicalOrder.count({
            where: { siteId, ...connectorWhere, placedAt: { gte: windowStart } },
          });
        }
        // Orders stuck in a pre-fulfilment state — the "delayed orders" signal.
        if (criteria.metric === 'delayed_orders') {
          return prisma.canonicalOrder.count({
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
          return prisma.canonicalOrder.count({
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
          const agg = await prisma.canonicalOrder.aggregate({
            where: { siteId, ...connectorWhere, placedAt: { gte: windowStart } },
            _sum: { totalAmount: true },
          });
          return agg._sum.totalAmount == null ? 0 : Number(agg._sum.totalAmount);
        }
        if (criteria.metric === 'aov') {
          const count = await prisma.canonicalOrder.count({
            where: { siteId, ...connectorWhere, placedAt: { gte: windowStart } },
          });
          if (count === 0) return null; // AOV undefined with 0 orders
          const agg = await prisma.canonicalOrder.aggregate({
            where: { siteId, ...connectorWhere, placedAt: { gte: windowStart } },
            _sum: { totalAmount: true },
          });
          return agg._sum.totalAmount == null ? null : Number(agg._sum.totalAmount) / count;
        }
        // Fallback: try kpiValue snapshot
        const row = await prisma.kpiValue.findFirst({
          where: { siteId, kpiName: criteria.metric, timestamp: { gte: windowStart } },
          orderBy: { timestamp: 'desc' },
        });
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
          return this.avgStorefrontSessionDuration(ids, windowStart);
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

      default:
        return null;
    }
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
  private static async avgStorefrontSessionDuration(ids: string[], windowStart: Date): Promise<number | null> {
    const rows = await prisma.$queryRawUnsafe<Array<{ avg_seconds: number | null }>>(
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
