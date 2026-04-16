import { NotificationAdapter } from '../notification-contract';
import { AlertPayload } from '../../models/alert.model';

export class EmailAdapter implements NotificationAdapter {
    async deliver(alert: AlertPayload): Promise<boolean> {
        // TODO: Map to SendGrid or AWS SES 
        console.log([Email] Sending warning: \);
        return true;
    }
}
