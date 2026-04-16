import { AlertRule } from '../models/rule.model';

/**
 * Sample alert rule definitions extracted from the TRD thresholds.
 * In production, these derive from dynamic Configuration management mapping tenant requests.
 */
export const SAMPLE_RULES: AlertRule[] = [
    {
        ruleId: 'rule_page_load_01',
        kpiName: 'pageLoadTime',
        operator: '>',
        threshold: 3000, // 3s
        severity: 'medium',
        enabled: true,
        description: 'Page load exceeded threshold'
    },
    {
        ruleId: 'rule_error_rate_01',
        kpiName: 'errorRatePct',
        operator: '>',
        threshold: 2.0, // 2%
        severity: 'high',
        enabled: true,
        description: 'Error rate > threshold'
    },
    {
        ruleId: 'rule_delayed_orders_01',
        kpiName: 'delayedOrdersCount',
        operator: '>',
        threshold: 0, // > 0 delayed orders flags alert immediately
        severity: 'critical',
        enabled: true,
        description: 'Orders delayed > 60 min'
    },
    {
        ruleId: 'rule_oms_failure_spike',
        kpiName: 'failureRateIncrement',
        operator: 'spike',
        threshold: 10, // Arbitrary spike check marker
        severity: 'critical',
        enabled: true,
        description: 'OMS sync failure spike detected'
    },
    {
        ruleId: 'rule_api_latency_01',
        kpiName: 'apiLatencyAverage',
        operator: '>',
        threshold: 1500, // 1.5s warning
        severity: 'low',
        enabled: true,
        description: 'API Latency Threshold bounds exceeded'
    }
];
