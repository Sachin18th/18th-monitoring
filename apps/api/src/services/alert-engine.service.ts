import { Alert, AlertRule, AlertSeverity, AlertStatus } from '../utils/alerting/types';
import crypto from 'crypto';

export class AlertEngine {
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
   * Compatibility method for ScheduledMonitor.
   * Evaluates project-level alerts (connector health, data freshness, etc).
   */
  static async evaluateProject(siteId: string, tenantId: string) {
    // console.log(`[AlertEngine] Evaluating project-level health for ${siteId}...`);
    // Logic for project-level health evaluation goes here
  }

  private static mapEventTypeToSource(type: string): string {
    if (type === 'backend_performance') return 'api';
    if (type === 'js_error' || type === 'business_failure') return 'failure';
    if (type === 'funnel_step' || type === 'interaction_signal') return 'journey';
    if (type === 'synthetic_run') return 'synthetic';
    return 'rum';
  }

  private static checkCondition(rule: AlertRule, event: any): boolean {
    // Simple evaluation logic for simulation
    // In production, this would aggregate over a time window
    if (rule.signalSource === 'api' && event.metadata.status >= 500) return true;
    if (rule.signalSource === 'synthetic' && event.metadata.status === 'FAIL') return true;
    if (rule.signalSource === 'failure' && event.eventType === 'js_error') return true;
    return false;
  }
}
