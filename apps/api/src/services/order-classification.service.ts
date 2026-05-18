import fs from 'fs';
import path from 'path';
import { CanonicalOrder, OrderChannel } from '../../../../packages/shared-types/src';

export class OrderClassificationService {
    private rulesPayload: any;

    constructor() {
        const rulesPath = path.join(__dirname, '../config/rules/order-source-rules.schema.json');
        try {
            const fileData = fs.readFileSync(rulesPath, 'utf8');
            this.rulesPayload = JSON.parse(fileData);
        } catch (err) {
            console.error('[ClassificationService] Failed to load rules definition', err);
            this.rulesPayload = { rules: [], default: 'ONLINE_STOREFRONT' };
        }
    }

    public classify(order: Partial<CanonicalOrder>): OrderChannel {
        const sortedRules = [...this.rulesPayload.rules].sort((a, b) => a.priority - b.priority);

        for (const rule of sortedRules) {
            if (this.evaluateConditions(order, rule.conditions)) {
                return rule.result.orderSource as OrderChannel;
            }
        }
        
        return this.rulesPayload.default as OrderChannel;
    }

    private evaluateConditions(data: any, conditions: any[]): boolean {
        return conditions.every(cond => {
            const actualValue = cond.field.split('.').reduce((o: any, i: string) => o?.[i], data);
            
            switch (cond.operator) {
                case 'equals':
                    return actualValue === cond.value;
                case 'not_equals':
                    return actualValue !== cond.value;
                case 'in':
                    return Array.isArray(cond.value) && cond.value.includes(actualValue);
                case 'contains':
                    return typeof actualValue === 'string' && actualValue.includes(cond.value);
                default:
                    return false;
            }
        });
    }
}

export const orderClassificationService = new OrderClassificationService();
