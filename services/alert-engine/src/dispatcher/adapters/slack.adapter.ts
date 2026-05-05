import { NotificationAdapter } from '../notification-contract';
import { AlertPayload } from '../../models/alert.model';

export class SlackAdapter implements NotificationAdapter {
    async deliver(alert: AlertPayload): Promise<boolean> {
        // TODO: Map Axios HTTP blocks for incoming webhooks
        console.log([Slack] Dispatching integration webhook: \);
        return true;
    }
<<<<<<< HEAD
}
=======
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
