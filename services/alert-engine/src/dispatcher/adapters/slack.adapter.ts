import { NotificationAdapter } from '../notification-contract';
import { AlertPayload } from '../../models/alert.model';

export class SlackAdapter implements NotificationAdapter {
    async deliver(alert: AlertPayload): Promise<boolean> {
        // TODO: Map Axios HTTP blocks for incoming webhooks
        console.log([Slack] Dispatching integration webhook: \);
        return true;
    }
}
