import { AlertPayload } from '../models/alert.model';

export interface NotificationAdapter {
    deliver(alert: AlertPayload): Promise<boolean>;
}
