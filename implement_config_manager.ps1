$basePath = "c:\kpi monitoring"
cd $basePath

function Write-File {
    param([string]$Path, [string]$Content)
    $dir = Split-Path $Path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Set-Content -LiteralPath $Path -Value  $Content.Trim() 
}

Write-File "packages/config/global-default.json" @"
{
  "tracking": {
    "performance": true,
    "user": true,
    "errors": true
  },
  "sampling": {
    "sessionRate": 1.0
  },
  "thresholds": {
    "pageLoadMs": 3000,
    "errorRatePct": 2.0
  }
}
"@

Write-File "apps/config-manager/src/schemas/config.schema.ts" @"
import { z } from 'zod';

export const TrackingConfigSchema = z.object({
    performance: z.boolean().default(true),
    user: z.boolean().default(true),
    errors: z.boolean().default(true),
    // TODO: Expansion placeholder accommodating specific integrations toggles (e.g., 'omsTracking: boolean')
});

export const SamplingConfigSchema = z.object({
    sessionRate: z.number().min(0).max(1.0).default(1.0),
});

export const ThresholdConfigSchema = z.object({
    pageLoadMs: z.number().positive(),
    errorRatePct: z.number().positive()
});

export const PlatformConfigSchema = z.object({
    tracking: TrackingConfigSchema,
    sampling: SamplingConfigSchema,
    thresholds: ThresholdConfigSchema,
    // Future hooks for explicitly embedded Tenant/Regional mappings
    features: z.record(z.boolean()).optional()
});
"@

Write-File "apps/config-manager/src/models/config.model.ts" @"
import { z } from 'zod';
import { PlatformConfigSchema } from '../schemas/config.schema';

export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;

export type ConfigStatus = 'draft' | 'active' | 'archived';

export interface ConfigDocument {
    versionId: string;
    targetLevel: 'global' | 'tenant' | 'site';
    targetId: string; // Resolves exactly mapped to an overarching tenantId or strict unique siteId
    config: Partial<PlatformConfig>;
    status: ConfigStatus;
    createdAt: string;
    updatedAt: string;
    updatedBy: string; // Capturing precise Admin User IDs for strict Audit trails
}
"@

Write-File "apps/config-manager/src/services/resolver.service.ts" @"
import { PlatformConfig } from '../models/config.model';

export class ConfigResolverService {
    
    /**
     * Recursively merges the payload objects to calculate the absolute 'truth' configuration.
     * Inheritance Strategy Mapping: Global Default -> Overridden closely by Tenant -> Overridden absolutely by isolated Site
     */
    static resolveConfig(globalConfig: Partial<PlatformConfig>, tenantConfig?: Partial<PlatformConfig>, siteConfig?: Partial<PlatformConfig>): PlatformConfig {
        
        const merged: any = { ...globalConfig };

        if (tenantConfig) {
            if (tenantConfig.tracking) merged.tracking = { ...merged.tracking, ...tenantConfig.tracking };
            if (tenantConfig.sampling) merged.sampling = { ...merged.sampling, ...tenantConfig.sampling };
            if (tenantConfig.thresholds) merged.thresholds = { ...merged.thresholds, ...tenantConfig.thresholds };
        }

        if (siteConfig) {
            if (siteConfig.tracking) merged.tracking = { ...merged.tracking, ...siteConfig.tracking };
            if (siteConfig.sampling) merged.sampling = { ...merged.sampling, ...siteConfig.sampling };
            if (siteConfig.thresholds) merged.thresholds = { ...merged.thresholds, ...siteConfig.thresholds };
        }

        return merged as PlatformConfig;
    }
}
"@

Write-File "apps/config-manager/src/interfaces/storage.interface.ts" @"
import { ConfigDocument, ConfigStatus } from '../models/config.model';

export interface ConfigRepository {
    // Interfacing with fundamental PostgreSQL storage abstractions pulling versions directly
    getConfigTarget(targetLevel: 'global' | 'tenant' | 'site', targetId: string, status: ConfigStatus): Promise<ConfigDocument | null>;
    saveConfig(doc: ConfigDocument): Promise<void>;
    updateStatus(versionId: string, status: ConfigStatus): Promise<void>;
    
    // Future implementations tying: Rollback tracking, auditing diffs between versions
}
"@

Write-File "apps/config-manager/src/services/config.service.ts" @"
import { PlatformConfigSchema } from '../schemas/config.schema';
import { ConfigDocument } from '../models/config.model';
import { ConfigRepository } from '../interfaces/storage.interface';
import { ConfigResolverService } from './resolver.service';

export class ConfigManagerService {

    constructor(private repo: ConfigRepository) {}

    /**
     * Executed predominantly by client tracking scripts and downstream ingestion pipelines validating settings natively.
     */
    async getActiveResolvedConfig(siteId: string, tenantId: string) {
        
        // Execute simultaneous fetching blocking against network stalls
        const [globalDef, tenantDef, siteDef] = await Promise.all([
            this.repo.getConfigTarget('global', 'global', 'active'),
            this.repo.getConfigTarget('tenant', tenantId, 'active'),
            this.repo.getConfigTarget('site', siteId, 'active')
        ]);

        return ConfigResolverService.resolveConfig(
            globalDef?.config || {},
            tenantDef?.config || {},
            siteDef?.config || {}
        );
    }

    /**
     * Validate against strict schema interfaces and insert pending un-activated version maps.
     */
    async stageConfigUpdate(targetLevel: 'global' | 'tenant' | 'site', targetId: string, payload: any, userId: string) {
        
        // Applying strict parse discarding injected malicious properties not covered by TRD tracking requirements
        const parsed = PlatformConfigSchema.partial().safeParse(payload);
        if (!parsed.success) {
            throw new Error(`Validation Error Details: \${parsed.error.message}`);
        }

        const draft: ConfigDocument = {
            versionId: crypto.randomUUID(), // Relying on Node 19+ crypto bindings mapped externally
            targetLevel,
            targetId,
            config: parsed.data,
            status: 'draft',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: userId
        };

        await this.repo.saveConfig(draft);
        return draft;
    }

    /**
     * Commits pending modifications directly executing system-wide propagation bindings.
     */
    async activateConfig(versionId: string) {
        // TODO: Query and downgrade current 'active' ID blocks gracefully mapped to 'archived' protecting history
        await this.repo.updateStatus(versionId, 'active');
        
        // TODO: Fire system broadcast -> 'ConfigInvalidated' across messaging bounds (Kafka)
        // Instructs: Redis Cache dropping config payloads, Alert Engines reloading definitions cleanly
    }
}
"@

Write-File "apps/config-manager/src/controllers/config.controller.ts" @"
import { ConfigManagerService } from '../services/config.service';

// Abstraction
let configService: ConfigManagerService; 

export const resolveConfig = async (req: any, res: any) => {
    try {
        const { siteId, tenantId } = req.query; // Token verification handled natively upstream
        const resolved = await configService.getActiveResolvedConfig(siteId, tenantId);
        
        return res.status(200).json(resolved);
    } catch (err) {
        return res.status(500).json({ error: 'Failed config compilation.' });
    }
};

export const createDraft = async (req: any, res: any) => {
    try {
        const { targetLevel, targetId, payload } = req.body;
        // userId retrieved natively from Dashboard verification tokens
        const draft = await configService.stageConfigUpdate(targetLevel, targetId, payload, req.userId);
        
        return res.status(201).json(draft);
    } catch (err: any) {
        return res.status(400).json({ error: err.message }); // Yields explicit Validation bounds safely
    }
};

export const publishDraft = async (req: any, res: any) => {
    try {
        const { versionId } = req.params;
        await configService.activateConfig(versionId);
        
        return res.status(200).json({ message: 'Version deployed system-wide.' });
    } catch (err) {
        return res.status(500).json({ error: 'Config Deployment Failure.' });
    }
};
"@

Write-File "apps/config-manager/src/routes/config.routes.ts" @"
import { resolveConfig, createDraft, publishDraft } from '../controllers/config.controller';

export const configRoutes = (router: any) => {
    
    // External consumption mappings: Loaded natively by website embeds identifying properties rapidly
    router.get('/api/v1/config/resolve', resolveConfig);

    // Advanced mutation mappings: Enforce explicit RBAC administration mappings internally
    router.post('/api/v1/config/draft', createDraft);
    router.post('/api/v1/config/version/:versionId/publish', publishDraft);
};
"@
