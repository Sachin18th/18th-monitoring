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
<<<<<<< HEAD
}
=======
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
