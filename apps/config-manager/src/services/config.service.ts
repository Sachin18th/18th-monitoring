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
            throw new Error(Validation Error Details: \);
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
