"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuleEvaluator = void 0;
const src_1 = require("../../../../packages/db/src");
const alert_storage_1 = require("../persistence/alert-storage");
const db = src_1.DatabaseFactory.getRelationalDb();
class RuleEvaluator {
    static async evaluate(siteId, kpiName, value, _dimensions) {
        const rules = await db.getAlertRules(siteId);
        const matching = rules.filter(r => r.siteId === siteId && r.kpiName === kpiName);
        for (const rule of matching) {
            const breached = (rule.type === 'gt' && value > rule.threshold) ||
                (rule.type === 'lt' && value < rule.threshold);
            if (breached) {
                console.log(`[AlertEngine] ⚠️  Rule "${rule.id}" breached — ${kpiName}: ${value} (threshold: ${rule.threshold})`);
                await alert_storage_1.AlertStorage.saveAlert({
                    ruleId: rule.id,
                    siteId, // ← required for per-tenant filtering
                    kpiName,
                    message: `${kpiName} breached threshold: value=${value}, threshold=${rule.threshold}`,
                    severity: rule.severity || 'high',
                    status: 'active',
                    triggeredAt: new Date().toISOString(),
                });
            }
        }
    }
}
exports.RuleEvaluator = RuleEvaluator;
