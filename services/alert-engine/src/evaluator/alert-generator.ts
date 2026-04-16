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

        console.log([AlertGenerator] Generated [\] alert for [\] \);
    }
}
