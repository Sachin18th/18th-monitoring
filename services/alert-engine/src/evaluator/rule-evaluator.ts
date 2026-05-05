import { prisma } from '../../../../packages/db/src';
import { AlertStorage } from '../persistence/alert-storage';

type RuleCriteria = {
    metric?: string;
    metricName?: string;
    kpiName?: string;
    operator?: 'gt' | 'lt' | 'eq' | '>' | '<' | '==';
    type?: 'gt' | 'lt' | 'eq';
    threshold?: number;
};

export class RuleEvaluator {
    static async evaluate(siteId: string, kpiName: string, value: number, _dimensions: any) {
        const rules = await prisma.alertRule.findMany({
            where: { siteId, enabled: 1 },
            select: { id: true, severity: true, criteria: true }
        });

        const matching = rules.filter((r) => {
            const criteria = (r.criteria || {}) as unknown as RuleCriteria;
            const ruleKpi = criteria.kpiName || criteria.metricName || criteria.metric;
            return ruleKpi === kpiName;
        });

        for (const rule of matching) {
            const criteria = (rule.criteria || {}) as unknown as RuleCriteria;
            const op = (criteria.type || criteria.operator || 'gt') as RuleCriteria['operator'];
            const threshold = Number(criteria.threshold ?? 0);
            const breached =
                ((op === 'gt' || op === '>') && value > threshold) ||
                ((op === 'lt' || op === '<') && value < threshold) ||
                ((op === 'eq' || op === '==') && value === threshold);

            if (breached) {
                console.log(`[AlertEngine] Rule "${rule.id}" breached - ${kpiName}: ${value} (threshold: ${threshold})`);
                await AlertStorage.saveAlert({
                    ruleId:      rule.id,
                    siteId,                          // ← required for per-tenant filtering
                    kpiName,
                    message:     `${kpiName} breached threshold: value=${value}, threshold=${threshold}`,
                    severity:    (rule.severity || 'high').toLowerCase(),
                    status:      'active',
                    triggeredAt: new Date().toISOString(),
                });
            }
        }
    }
}