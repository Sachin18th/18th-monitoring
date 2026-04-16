import { DatabaseFactory } from '../../../../packages/db/src';
import { AlertStorage } from '../persistence/alert-storage';

const db = DatabaseFactory.getRelationalDb();

export class RuleEvaluator {
    static async evaluate(siteId: string, kpiName: string, value: number, _dimensions: any) {
        const rules = await db.getAlertRules(siteId);
        const matching = rules.filter(r => r.siteId === siteId && r.kpiName === kpiName);

        for (const rule of matching) {
            const breached =
                (rule.type === 'gt' && value > rule.threshold) ||
                (rule.type === 'lt' && value < rule.threshold);

            if (breached) {
                console.log(`[AlertEngine] ⚠️  Rule "${rule.id}" breached — ${kpiName}: ${value} (threshold: ${rule.threshold})`);
                await AlertStorage.saveAlert({
                    ruleId:      rule.id,
                    siteId,                          // ← required for per-tenant filtering
                    kpiName,
                    message:     `${kpiName} breached threshold: value=${value}, threshold=${rule.threshold}`,
                    severity:    rule.severity || 'high',
                    status:      'active',
                    triggeredAt: new Date().toISOString(),
                });
            }
        }
    }
}
