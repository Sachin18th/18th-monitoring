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
        console.log([NotificationDispatcher] Delivered trace: \);
    }
}
