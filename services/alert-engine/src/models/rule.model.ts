export type RuleConditionOperator = '>' | '<' | '>=' | '<=' | '==' | 'spike' | 'correlation';

export interface AlertRule {
    ruleId: string;
    siteId?: string; // undefined means globally applied to all tenants
    kpiName: string;
    operator: RuleConditionOperator;
    threshold: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    enabled: boolean;
    description: string;
}
