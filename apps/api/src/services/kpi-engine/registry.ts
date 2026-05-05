export interface KpiDefinition {
    id: string;
    key: string;
    name: string;
    category: 'BUSINESS' | 'OPERATIONAL' | 'EXPERIENCE' | 'TECHNICAL';
    formula: 'SUM' | 'COUNT' | 'AVERAGE' | 'PERCENTAGE' | 'CUSTOM';
    canonicalEntity: string;  // e.g., ORDER, PIPELINE_JOB
    targetField?: string;     // e.g., totalAmount
    supportedDimensions: string[]; // e.g., ['channel', 'sourceSystem']
    granularities: string[];  // e.g., ['daily', 'hourly']
    freshnessSlaMinutes: number;
    active: boolean;
}

export class KpiRegistry {
    private static definitions: Map<string, KpiDefinition> = new Map([
        // ─── BUSINESS KPIs ──────────────────────────────────────────────
        ['revenue', {
            id: 'kpi_biz_001',
            key: 'revenue',
            name: 'Gross Revenue',
            category: 'BUSINESS',
            formula: 'SUM',
            canonicalEntity: 'ORDER',
            targetField: 'totalAmount',
            supportedDimensions: ['channel', 'sourceSystem', 'currency'],
            granularities: ['hourly', 'daily', 'weekly', 'monthly'],
            freshnessSlaMinutes: 15,
            active: true
        }],
        ['order_count', {
            id: 'kpi_biz_002',
            key: 'order_count',
            name: 'Order Volume',
            category: 'BUSINESS',
            formula: 'COUNT',
            canonicalEntity: 'ORDER',
            supportedDimensions: ['channel', 'sourceSystem'],
            granularities: ['hourly', 'daily', 'weekly', 'monthly'],
            freshnessSlaMinutes: 15,
            active: true
        }],
        
        // ─── OPERATIONAL KPIs ───────────────────────────────────────────
        ['pipeline_success_rate', {
            id: 'kpi_ops_001',
            key: 'pipeline_success_rate',
            name: 'Pipeline Success Rate',
            category: 'OPERATIONAL',
            formula: 'PERCENTAGE',
            canonicalEntity: 'PIPELINE_JOB',
            supportedDimensions: ['integrationId', 'jobType'],
            granularities: ['hourly', 'daily'],
            freshnessSlaMinutes: 5,
            active: true
        }],
        
        // ─── EXPERIENCE KPIs ────────────────────────────────────────────
        ['page_load_time', {
            id: 'kpi_exp_001',
            key: 'page_load_time',
            name: 'Page Load Time',
            category: 'EXPERIENCE',
            formula: 'AVERAGE',
            canonicalEntity: 'PERFORMANCE_METRIC',
            targetField: 'metricValue',
            supportedDimensions: ['device', 'browser', 'route'],
            granularities: ['hourly', 'daily'],
            freshnessSlaMinutes: 5,
            active: true
        }]
    ]);

    /**
     * Get a specific KPI Definition by its key
     */
    public static getDefinition(key: string): KpiDefinition | undefined {
        return this.definitions.get(key);
    }

    /**
     * List all available definitions, optionally filtering by category.
     */
    public static listDefinitions(category?: string): KpiDefinition[] {
        const defs = Array.from(this.definitions.values());
        if (category) {
            return defs.filter(d => d.category === category);
        }
        return defs;
    }

    /**
     * Determine what KPIs are actually available for a project given its active integrations/SDKs.
     * Evaluates data coverage dynamically (Phase 7 rule)
     */
    public static evaluateProjectCoverage(siteId: string, activeIntegrationTypes: string[]): any {
        // In a real system, we cross-reference Integration Capabilities with KPI source requirements.
        // For example, if a project only has SAP, they might not have Google SDK coverage.
        const coverage = {
            available: [] as KpiDefinition[],
            unavailable: [] as { key: string, reason: string }[]
        };

        for (const def of this.definitions.values()) {
            if (def.category === 'EXPERIENCE' && !activeIntegrationTypes.includes('browser_sdk')) {
                coverage.unavailable.push({ key: def.key, reason: 'Telemetry SDK not deployed' });
            } else {
                coverage.available.push(def);
            }
        }

        return coverage;
    }
}
