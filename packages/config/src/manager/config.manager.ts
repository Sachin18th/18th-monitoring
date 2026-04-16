import { ProjectConfigPayload } from '../../../shared-types/src';
// Assume db exposes drizzle db instance matching schema
import { db } from '../../../db/src/adapters/postgres-relational.adapter'; 
import { siteConfigs, configVersions } from '../../../db/src/drizzle/schema';
import crypto from 'crypto';
import { eq, desc } from 'drizzle-orm';
import { cache, TTL } from '../../../../packages/cache/src';
import { AuditService } from '../../../../apps/api/src/services/audit.service';

export class ConfigManager {
    /**
     * Get the actively published configuration.
     * Cached with TTL.RESOLVED_CONFIG.
     */
    async getResolvedConfig(siteId: string): Promise<ProjectConfigPayload | null> {
        const CACHE_KEY = `resolved:${siteId}`;
        const hit = await cache.get<ProjectConfigPayload>(CACHE_KEY);
        if (hit) return hit;

        const site = await db.select().from(siteConfigs).where(eq(siteConfigs.siteId, siteId)).limit(1);
        if (!site.length || !site[0].activeVersionId) return null;

        const version = await db.select().from(configVersions).where(eq(configVersions.versionId, site[0].activeVersionId)).limit(1);
        if (!version.length) return null;

        const v = version[0];
        const result: ProjectConfigPayload = {
            tracking: {},
            sampling: { rate: 100 },
            metrics: v.kpiDefinitionBlob as any,
            widgets: v.widgetDefinitionBlob as any,
            connectors: v.connectorDefinitionBlob as any,
            orderSourceRules: []
        };

        await cache.set(CACHE_KEY, result, TTL.RESOLVED_CONFIG);
        return result;
    }

    /**
     * Commits a draft payload to a new version and marks it active.
     */
    async publishDraft(siteId: string, actorId: string, payload: ProjectConfigPayload) {
        const result = await db.transaction(async (tx: any) => {
            const versionId = crypto.randomUUID();

            // Fetch latest version number
            const latest = await tx.select()
                .from(configVersions)
                .where(eq(configVersions.siteId, siteId))
                .orderBy(desc(configVersions.versionNumber))
                .limit(1);

            const nextVersion = latest.length > 0 ? latest[0].versionNumber + 1 : 1;

            // Insert new version
            await tx.insert(configVersions).values({
                versionId,
                siteId,
                versionNumber: nextVersion,
                status: 'PUBLISHED',
                kpiDefinitionBlob: payload.metrics,
                widgetDefinitionBlob: payload.widgets,
                connectorDefinitionBlob: payload.connectors,
                createdBy: actorId
            });

            // Update active site pointer safely using ON CONFLICT (upsert paradigm)
            await tx.insert(siteConfigs).values({
                siteId,
                activeVersionId: versionId,
            }).onConflictDoUpdate({
                target: siteConfigs.siteId,
                set: { activeVersionId: versionId, updatedAt: new Date() }
            });

            // Write audit trail
            await AuditService.log({
                action: 'CONFIG_PUBLISHED',
                actorId,
                siteId,
                entityType: 'config_version',
                entityId: versionId,
                changes: { publishedVersion: nextVersion }
            });

            return { success: true, versionId, nextVersion };
        });

        // Invalidate cache immediately after transaction
        await cache.del(`resolved:${siteId}`);
        return result;
    }

    /**
     * Reverts to a historic version ID.
     */
    async rollbackToVersion(siteId: string, actorId: string, targetVersionId: string) {
        const result = await db.transaction(async (tx: any) => {
            const version = await tx.select().from(configVersions).where(eq(configVersions.versionId, targetVersionId)).limit(1);
            if (!version.length) throw new Error('Target version not found');

            await tx.update(siteConfigs)
                    .set({ activeVersionId: targetVersionId, updatedAt: new Date() })
                    .where(eq(siteConfigs.siteId, siteId));

            await AuditService.log({
                action: 'CONFIG_ROLLBACK',
                actorId,
                siteId,
                entityType: 'config_version',
                entityId: targetVersionId,
                changes: { rollbackToNumber: version[0].versionNumber }
            });

            return { success: true, activeVersion: version[0].versionNumber };
        });

        // Invalidate cache immediately after transaction
        await cache.del(`resolved:${siteId}`);
        return result;
    }
}

export const configManager = new ConfigManager();
