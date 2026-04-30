import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { env } from '../config/env';

type AlertRecord = {
    id: string;
    siteId: string;
    severity: string;
    status: string;
    message: string;
    correlationId?: string;
    metricRef?: string;
    currentValue?: unknown;
    thresholdValue?: unknown;
    triggeredAt?: string;
    timestamp?: string;
};

export class NotificationDispatcher {

    /**
     * Dispatches an alert to all project-configured notification channels.
     * In production this would push to BullMQ for reliable async delivery.
     */
    public static async dispatch(alert: AlertRecord): Promise<void> {
        const subscriptions = GlobalMemoryStore.projectWebhookSubscriptions.get(alert.siteId) || [];
        
        // Find subscriptions listening to alert events
        const alertSubscriptions = subscriptions.filter((sub: any) =>
            sub.status === 'active' && (
                sub.eventTypes?.includes('alert.triggered') ||
                sub.eventTypes?.includes('*')
            )
        );

        if (alertSubscriptions.length === 0) {
            console.log(`[Notifications] No channels configured for ${alert.siteId} — alert stored only.`);
            return;
        }

        const payload = this.buildNotificationPayload(alert);

        if (env.NODE_ENV === 'development' && env.ENABLE_OUTBOUND_NOTIFICATIONS !== 'true') {
            console.log(`[Notifications] 🛡️ Skipped dispatch for ${alert.siteId} (local dev mode safeguard enabled)`);
            return;
        }

        for (const subscription of alertSubscriptions) {
            await this.sendWithRetry(subscription, payload, alert.correlationId || alert.id);
        }
    }

    private static buildNotificationPayload(alert: AlertRecord) {
        return {
            event: 'alert.triggered',
            correlationId: alert.correlationId || alert.id,
            alert: {
                id: alert.id,
                severity: alert.severity,
                status: alert.status,
                message: alert.message,
                metric: alert.metricRef,
                value: alert.currentValue,
                threshold: alert.thresholdValue,
                triggeredAt: alert.triggeredAt || alert.timestamp,
                projectId: alert.siteId
            },
            timestamp: new Date().toISOString()
        };
    }

    private static async sendWithRetry(subscription: any, payload: any, correlationId: string, attempt = 1): Promise<void> {
        const maxRetries = subscription.retryPolicy?.maxRetries || 3;

        try {
            // In a real system: actual HTTP POST to subscription.callbackUrl
            // For MVP: simulate delivery logging
            console.log(`[Notifications] 📤 Dispatching alert to ${subscription.label} (${subscription.callbackUrl}) - Attempt ${attempt}`);

            // Simulate delivery log
            GlobalMemoryStore.webhookDeliveryLogs.push({
                id: `dlv_${Date.now()}`,
                subscriptionId: subscription.id,
                siteId: subscription.siteId,
                event: 'alert.triggered',
                correlationId,
                status: 'delivered',
                statusCode: 200,
                attempt,
                deliveredAt: new Date().toISOString()
            });

        } catch (err: any) {
            console.error(`[Notifications] ⨯ Failed delivery to ${subscription.label}: ${err.message}`);
            
            if (attempt < maxRetries) {
                const backoff = Math.pow(2, attempt) * 500;
                setTimeout(() => this.sendWithRetry(subscription, payload, correlationId, attempt + 1), backoff);
            } else {
                GlobalMemoryStore.webhookDeliveryLogs.push({
                    id: `dlv_${Date.now()}`,
                    subscriptionId: subscription.id,
                    siteId: subscription.siteId,
                    event: 'alert.triggered',
                    correlationId,
                    status: 'failed',
                    attempt,
                    error: err.message,
                    deliveredAt: new Date().toISOString()
                });
            }
        }
    }
}
