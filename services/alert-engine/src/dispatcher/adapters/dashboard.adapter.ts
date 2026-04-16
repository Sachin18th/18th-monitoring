import { NotificationAdapter } from '../notification-contract';
import { AlertPayload } from '../../models/alert.model';

export class DashboardAdapter implements NotificationAdapter {
    async deliver(alert: AlertPayload): Promise<boolean> {
        // TODO: Establish Websocket mappings broadcasting live red badges to Next.js
        console.log([Dashboard] Firing UI badge notification: \);
        return true;
    }
}
