import { AlertPayload } from '../models/alert.model';

export interface NotificationAdapter {
    deliver(alert: AlertPayload): Promise<boolean>;
<<<<<<< HEAD
}
=======
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
