import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { DatabaseFactory } from '../../../../packages/db/src';

const db = DatabaseFactory.getRelationalDb();

export interface AlertPayload {
    ruleId: string;
    siteId: string;          // Required for per-tenant alert isolation
    kpiName: string;
    message: string;
    severity: string;
    status: string;
    triggeredAt: string;
}

export type AlertStatus = 'triggered' | 'active' | 'acknowledged' | 'resolved';

export class AlertStorage {
    static async saveAlert(alert: AlertPayload): Promise<void> {
        await db.saveAlertState(alert);
    }

    static async updateStatus(alertId: string, status: AlertStatus): Promise<void> {
        const alert = GlobalMemoryStore.alerts.find(a => a.alertId === alertId);
        if (alert) {
            alert.status = status;
            console.log(`[AlertStorage] Alert ${alertId} → ${status}`);
        }
    }

    static getAll(): any[] {
        return GlobalMemoryStore.alerts;
    }
}
