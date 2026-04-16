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
