import { z } from 'zod';

/**
 * The configurable "brain" of an alert rule.
 *
 * Stored inside the `AlertRule.criteria` JSON column (no schema migration needed).
 * A rule says: "watch <metric> from <metricFamily>; when it goes <operator>
 * <threshold> over the last <windowMinutes>, raise an alert and notify these
 * recipients on these channels."
 */

export const METRIC_FAMILIES = [
  'pagespeed',
  'rum_errors',
  'orders',
  'customer_session',
  'journey',
  'integration',
  'payment_gateway',
  'sms_gateway',
] as const;
export type MetricFamily = (typeof METRIC_FAMILIES)[number];

/**
 * Metrics selectable per family. Keep this in sync with the evaluation logic in
 * alert-engine.service.ts and the metric dropdown in the Alert Center UI.
 */
export const METRIC_CATALOG: Record<MetricFamily, { metric: string; label: string; unit: string }[]> = {
  pagespeed: [
    { metric: 'lcp', label: 'Largest Contentful Paint', unit: 'ms' },
    { metric: 'cls', label: 'Cumulative Layout Shift', unit: 'score' },
    { metric: 'fid', label: 'First Input Delay', unit: 'ms' },
    { metric: 'ttfb', label: 'Time To First Byte', unit: 'ms' },
    { metric: 'tbt', label: 'Total Blocking Time', unit: 'ms' },
    { metric: 'score', label: 'Performance score', unit: 'score' },
  ],
  rum_errors: [
    { metric: 'error_count', label: 'All storefront errors', unit: 'count' },
    { metric: 'js_errors', label: 'JavaScript errors', unit: 'count' },
    { metric: 'network_errors', label: 'Network errors', unit: 'count' },
    { metric: 'resource_errors', label: 'Resource load errors', unit: 'count' },
    { metric: 'checkout_errors', label: 'Errors on checkout page', unit: 'count' },
  ],
  orders: [
    { metric: 'revenue', label: 'Revenue', unit: 'currency' },
    { metric: 'order_count', label: 'Order count', unit: 'count' },
    { metric: 'aov', label: 'Average order value', unit: 'currency' },
    { metric: 'delayed_orders', label: 'Delayed orders', unit: 'count' },
    { metric: 'failed_orders', label: 'Failed / cancelled orders', unit: 'count' },
  ],
  customer_session: [
    { metric: 'session_count', label: 'Customer session count', unit: 'count' },
    { metric: 'conversion_rate', label: 'Session conversion rate', unit: '%' },
    { metric: 'avg_session_duration', label: 'Avg session duration', unit: 's' },
  ],
  journey: [
    { metric: 'checkout_abandonment', label: 'Checkout abandonment rate', unit: '%' },
    { metric: 'completion_rate', label: 'Checkout completion rate', unit: '%' },
  ],
  integration: [
    { metric: 'sync_failures', label: 'Failed data syncs', unit: 'count' },
    { metric: 'unhealthy_connectors', label: 'Unreachable / failing integrations', unit: 'count' },
  ],
  payment_gateway: [
    { metric: 'degraded_gateways', label: 'Payment gateways down or degraded', unit: 'count' },
  ],
  sms_gateway: [
    { metric: 'degraded_gateways', label: 'SMS gateways down or degraded', unit: 'count' },
  ],
};

export const ruleCriteriaSchema = z.object({
  metricFamily: z.enum(METRIC_FAMILIES),
  metric: z.string().min(1),
  operator: z.enum(['>', '<', '>=', '<=', '==']),
  threshold: z.number().finite(),
  windowMinutes: z.number().int().positive().max(1440).default(15),
  channels: z
    .object({ email: z.boolean().default(true) })
    .default({ email: true }),
  recipients: z.array(z.string().email()).default([]),
  // Notification delivery for this rule:
  //   'immediate' → email the moment it breaches (use for urgent rules)
  //   'digest'    → don't email per-breach; a flush job batches all pending
  //                 digest alerts per recipient into ONE rollup email every
  //                 `digestMinutes`. Default keeps inboxes quiet.
  notifyMode: z.enum(['immediate', 'digest']).default('digest'),
  digestMinutes: z.number().int().positive().max(1440).default(60),
  // Optional per-rule email customization. Both support placeholders:
  // {{rule}} {{severity}} {{metric}} {{metricFamily}} {{operator}}
  // {{threshold}} {{value}} {{window}} {{message}} {{link}}
  emailSubject: z.string().max(255).optional(),
  emailBody: z.string().max(5000).optional(),
});

export type RuleCriteria = z.infer<typeof ruleCriteriaSchema>;

/** Placeholder tokens available in emailSubject / emailBody templates. */
export const EMAIL_TEMPLATE_TOKENS = [
  'rule', 'severity', 'metric', 'metricFamily', 'operator',
  'threshold', 'value', 'window', 'message', 'link',
] as const;

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

/** Full payload accepted when creating/updating a rule. */
export const alertRuleInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  severity: z.enum(SEVERITIES).default('HIGH'),
  enabled: z.boolean().default(true),
  cooldownMinutes: z.number().int().min(0).max(1440).default(60),
  // The store this rule belongs to. When set, the rule evaluates that
  // connector's metrics and its alerts are stamped with this id so the
  // store-scoped Alert Center filter surfaces them. Null/omitted = the rule
  // is project-wide (evaluates across all of the site's connectors).
  connectorInstanceId: z.string().min(1).nullish(),
  criteria: ruleCriteriaSchema,
});

export type AlertRuleInput = z.infer<typeof alertRuleInputSchema>;

/**
 * Project-level alert notification settings (recipients + summary cadence).
 * Configured once per project, not per rule. `lastSummaryAt` is internal
 * bookkeeping and intentionally not accepted from the client.
 */
export const alertNotificationsSchema = z.object({
  recipients: z.array(z.string().email()).default([]),
  summaryEnabled: z.boolean().default(true),
  summaryMinutes: z.number().int().positive().max(1440).default(60),
  immediateCritical: z.boolean().default(true),
});

export type AlertNotificationsInput = z.infer<typeof alertNotificationsSchema>;

/** Friendly summary-cadence choices surfaced in the notification settings UI. */
export const SUMMARY_CADENCE_OPTIONS = [
  { minutes: 15, label: 'Every 15 minutes' },
  { minutes: 60, label: 'Every hour' },
  { minutes: 360, label: 'Every 6 hours' },
  { minutes: 1440, label: 'Once a day' },
] as const;
