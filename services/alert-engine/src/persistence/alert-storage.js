"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertStorage = void 0;
const in_memory_adapter_1 = require("../../../../packages/db/src/adapters/in-memory.adapter");
const src_1 = require("../../../../packages/db/src");
const db = src_1.DatabaseFactory.getRelationalDb();
class AlertStorage {
    static async saveAlert(alert) {
        await db.saveAlertState(alert);
    }
    static async updateStatus(alertId, status) {
        const alert = in_memory_adapter_1.GlobalMemoryStore.alerts.find(a => a.alertId === alertId);
        if (alert) {
            alert.status = status;
            console.log(`[AlertStorage] Alert ${alertId} → ${status}`);
        }
    }
    static getAll() {
        return in_memory_adapter_1.GlobalMemoryStore.alerts;
    }
}
exports.AlertStorage = AlertStorage;
