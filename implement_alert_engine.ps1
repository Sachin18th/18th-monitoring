$basePath = "c:\kpi monitoring"
cd $basePath

function Write-File {
    param([string]$Path, [string]$Content)
    $dir = Split-Path $Path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Set-Content -Path $Path -Value  $Content.Trim() -Encoding UTF8
}

Write-File "services/alert-engine/src/models/alert.model.ts" @"
export type AlertStatus = 'triggered' | 'active' | 'acknowledged' | 'resolved';

export interface AlertPayload {
    alertId: string;
    siteId: string;
    ruleId: string;
    kpiName: string;
    status: AlertStatus;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    triggerValue: number;
    thresholdValue: number;
    message: string;
    triggeredAt: string;
    resolvedAt?: string;
    context?: Record<string, any>;
}
"@

Write-File "services/alert-engine/src/models/rule.model.ts" @"
export type RuleConditionOperator = '>' | '<' | '>=' | '<=' | '==' | 'spike' | 'correlation';

export interface AlertRule {
    ruleId: string;
    siteId?: string; // undefined means globally applied to all tenants
    kpiName: string;
    operator: RuleConditionOperator;
    threshold: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    enabled: boolean;
    description: string;
}
"@

Write-File "services/alert-engine/src/config/rule-definitions.ts" @"
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
"@

Write-File "services/alert-engine/src/evaluator/rule-evaluator.ts" @"
import { AlertRule } from '../models/rule.model';
import { SAMPLE_RULES } from '../config/rule-definitions';
import { AlertGenerator } from './alert-generator';

export class RuleEvaluator {
    
    /**
     * Entry hook from Processor/Anomaly Detector testing thresholds against active streaming values.
     */
    static async evaluate(siteId: string, kpiName: string, currentValue: number, context?: any) {
        
        // Filter rules tailored to KPI and explicit tenant (resolving correctly)
        const activeRules = SAMPLE_RULES.filter(r => r.kpiName === kpiName && r.enabled && (!r.siteId || r.siteId === siteId));

        for (const rule of activeRules) {
            const isViolated = this.checkCondition(rule, currentValue);
            if (isViolated) {
                // TODO: Deduplication filters -> If Alert [siteId + ruleId] is already "active", discard.
                // TODO: Suppression/cooldown limits 
                // TODO: Smart/Correlation alerts evaluating multi-metric states together
                await AlertGenerator.generateAlert(siteId, rule, currentValue, context);
            }
        }
    }

    private static checkCondition(rule: AlertRule, currentValue: number): boolean {
        switch (rule.operator) {
            case '>': return currentValue > rule.threshold;
            case '<': return currentValue < rule.threshold;
            case '>=': return currentValue >= rule.threshold;
            case '<=': return currentValue <= rule.threshold;
            case '==': return currentValue === rule.threshold;
            case 'spike': 
                // TODO: Implement calculation measuring deviation bounds from moving averages
                return false; 
            case 'correlation':
                // TODO: Placeholder referencing dynamic redis locks across cross-sectional metrics
                return false;
            default:
                return false;
        }
    }
}
"@

Write-File "services/alert-engine/src/evaluator/alert-generator.ts" @"
import { AlertRule } from '../models/rule.model';
import { AlertPayload } from '../models/alert.model';
import { AlertStorage } from '../persistence/alert-storage';
import { NotificationDispatcher } from '../dispatcher/notification-dispatcher';
import * as crypto from 'crypto';

export class AlertGenerator {
    /**
     * Constructs the Alert entity payload triggering persistence and notification dispatch layers.
     */
    static async generateAlert(siteId: string, rule: AlertRule, triggerValue: number, context?: any) {
        
        const alert: AlertPayload = {
            alertId: crypto.randomUUID(),
            siteId,
            ruleId: rule.ruleId,
            kpiName: rule.kpiName,
            status: 'triggered',
            severity: rule.severity,
            triggerValue,
            thresholdValue: rule.threshold,
            message: rule.description,
            triggeredAt: new Date().toISOString(),
            context
        };

        // Push to relational DB for UI Tracking
        await AlertStorage.saveAlert(alert);

        // TODO: Prepare alert grouping window aggregation
        await NotificationDispatcher.dispatch(alert);

        console.log(`[AlertGenerator] Generated [\${alert.severity}] alert for [\${siteId}] \${rule.kpiName}`);
    }
}
"@

Write-File "services/alert-engine/src/persistence/alert-storage.ts" @"
import { AlertPayload, AlertStatus } from '../models/alert.model';

export class AlertStorage {
    // TODO: Connect to PostgreSQL using TypeORM / Prisma saving metadata
    static async saveAlert(alert: AlertPayload): Promise<void> {
        // Logs a row in the Alert repository
    }

    static async updateStatus(alertId: string, status: AlertStatus): Promise<void> {
        // Exposed to backend REST allowing admins to "acknowledge" or "resolve" incidents
    }
}
"@

Write-File "services/alert-engine/src/dispatcher/notification-contract.ts" @"
import { AlertPayload } from '../models/alert.model';

export interface NotificationAdapter {
    deliver(alert: AlertPayload): Promise<boolean>;
}
"@

Write-File "services/alert-engine/src/dispatcher/adapters/email.adapter.ts" @"
import { NotificationAdapter } from '../notification-contract';
import { AlertPayload } from '../../models/alert.model';

export class EmailAdapter implements NotificationAdapter {
    async deliver(alert: AlertPayload): Promise<boolean> {
        // TODO: Map to SendGrid or AWS SES 
        console.log(`[Email] Sending warning: \${alert.message}`);
        return true;
    }
}
"@

Write-File "services/alert-engine/src/dispatcher/adapters/slack.adapter.ts" @"
import { NotificationAdapter } from '../notification-contract';
import { AlertPayload } from '../../models/alert.model';

export class SlackAdapter implements NotificationAdapter {
    async deliver(alert: AlertPayload): Promise<boolean> {
        // TODO: Map Axios HTTP blocks for incoming webhooks
        console.log(`[Slack] Dispatching integration webhook: \${alert.message}`);
        return true;
    }
}
"@

Write-File "services/alert-engine/src/dispatcher/adapters/dashboard.adapter.ts" @"
import { NotificationAdapter } from '../notification-contract';
import { AlertPayload } from '../../models/alert.model';

export class DashboardAdapter implements NotificationAdapter {
    async deliver(alert: AlertPayload): Promise<boolean> {
        // TODO: Establish Websocket mappings broadcasting live red badges to Next.js
        console.log(`[Dashboard] Firing UI badge notification: \${alert.message}`);
        return true;
    }
}
"@

Write-File "services/alert-engine/src/dispatcher/notification-dispatcher.ts" @"
import { AlertPayload } from '../models/alert.model';
import { EmailAdapter } from './adapters/email.adapter';
import { SlackAdapter } from './adapters/slack.adapter';
import { DashboardAdapter } from './adapters/dashboard.adapter';

export class NotificationDispatcher {
    
    // Abstracting delivery systems
    private static email = new EmailAdapter();
    private static slack = new SlackAdapter();
    private static dashboard = new DashboardAdapter();

    static async dispatch(alert: AlertPayload) {
        
        // Base notification channels
        const operations = [
            this.dashboard.deliver(alert), 
            this.slack.deliver(alert)      
        ];

        // TODO: Determine strict Escalation Policy (e.g., waiting 5 minutes if unacknowledged)
        // Hard-routing critical infrastructure to PagerDuty or Email channels
        if (alert.severity === 'critical') {
            operations.push(this.email.deliver(alert));
        }

        await Promise.all(operations);
        console.log(`[NotificationDispatcher] Delivered trace: \${alert.alertId}`);
    }
}
"@

Write-File "services/alert-engine/src/index.ts" @"
import { RuleEvaluator } from './evaluator/rule-evaluator';

async function bootstrap() {
    console.log('[AlertEngine] Evaluator started. Listening for threshold injections...');
    
    // Simulating bounding hook
    await RuleEvaluator.evaluate('store_001', 'pageLoadTime', 3500, { url: '/checkout' });
}

bootstrap().catch(console.error);
"@
