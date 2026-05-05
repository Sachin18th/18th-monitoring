import crypto from 'crypto';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';

export interface WebhookDeliveryAttempt {
    id: string;
    subscriptionId: string;
    eventId: string;
    url: string;
    payload: any;
    status: 'pending' | 'success' | 'failure' | 'retrying';
    responseCode?: number;
    responseBody?: string;
    attemptCount: number;
    lastAttemptAt?: string;
    nextAttemptAt?: string;
}

export class OutboundDispatcherService {
    /**
     * Dispatches a normalized event to all active subscribers.
     */
    static async dispatch(siteId: string, event: any) {
        const subscriptions = GlobalMemoryStore.projectWebhookSubscriptions.get(siteId) || [];
        const activeSubs = subscriptions.filter(s => 
            s.status === 'active' && 
            (s.eventTypes.includes(event.type) || s.eventTypes.includes('*'))
        );

        if (activeSubs.length === 0) return;

        console.log(`[Outbound] Routing event ${event.id} (${event.type}) to ${activeSubs.length} subscribers…`);

        for (const sub of activeSubs) {
            await this.enqueueDelivery(sub, event);
        }
    }

    private static async enqueueDelivery(subscription: any, event: any) {
        const delivery: WebhookDeliveryAttempt = {
            id: `del_${crypto.randomUUID().slice(0, 8)}`,
            subscriptionId: subscription.id,
            eventId: event.id,
            url: subscription.callbackUrl,
            payload: event,
            status: 'pending',
            attemptCount: 0
        };

        GlobalMemoryStore.webhookDeliveryLogs.push(delivery);
        
        // Asynchronously process the delivery (simulating a background worker)
        this.processDelivery(delivery, subscription.secret);
    }

    private static async processDelivery(delivery: WebhookDeliveryAttempt, secret: string) {
        delivery.attemptCount++;
        delivery.lastAttemptAt = new Date().toISOString();
        
        const payloadString = JSON.stringify(delivery.payload);
        const timestamp = Date.now().toString();
        
        // HMAC Signature Generation
        const signature = crypto
            .createHmac('sha256', secret)
            .update(`${timestamp}.${payloadString}`)
            .digest('hex');

        try {
            console.log(`[Outbound] Delivering to ${delivery.url} (Attempt ${delivery.attemptCount})…`);
            
            const response = await fetch(delivery.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Platform-Event-Id': delivery.eventId,
                    'X-Platform-Signature': signature,
                    'X-Platform-Timestamp': timestamp,
                    'User-Agent': 'Platform-Outbound-Engine/1.0'
                },
                body: payloadString,
                // Short timeout for webhooks
                signal: AbortSignal.timeout(5000)
            });

            delivery.responseCode = response.status;
            
            if (response.ok) {
                delivery.status = 'success';
                console.log(`[Outbound] ✓ Delivery successful for ${delivery.id}`);
            } else {
                throw new Error(`Endpoint returned ${response.status}`);
            }
        } catch (err: any) {
            const isRetryable = delivery.attemptCount < 5; // Simple retry limit
            delivery.status = isRetryable ? 'retrying' : 'failure';
            delivery.responseBody = err.message;
            
            console.error(`[Outbound] ✗ Delivery failed for ${delivery.id}: ${err.message}`);

            if (isRetryable) {
                const delay = Math.pow(2, delivery.attemptCount) * 1000; // Exponential backoff
                delivery.nextAttemptAt = new Date(Date.now() + delay).toISOString();
                
                setTimeout(() => {
                    this.processDelivery(delivery, secret);
                }, delay);
            }
        }
    }

    static async getRecentLogs(siteId: string) {
        const subs = GlobalMemoryStore.projectWebhookSubscriptions.get(siteId) || [];
        const subIds = subs.map(s => s.id);
        return GlobalMemoryStore.webhookDeliveryLogs
            .filter(l => subIds.includes(l.subscriptionId))
            .sort((a, b) => new Date(b.lastAttemptAt || 0).getTime() - new Date(a.lastAttemptAt || 0).getTime())
            .slice(0, 50);
    }
}
