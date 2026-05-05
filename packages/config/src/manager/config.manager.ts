import { ProjectConfigPayload } from '../../../shared-types/src';
import prisma from '../../../db/src/prisma-client';
import { cache, TTL } from '../../../../packages/cache/src';
import { AuditService } from '../../../../apps/api/src/services/audit.service';

declare const require: {
    (name: string): any;
};

const crypto = require('crypto');

export class ConfigManager {
    /**
     * Get the actively published configuration.
     * Cached with TTL.RESOLVED_CONFIG.
     */
    async getResolvedConfig(siteId: string): Promise<ProjectConfigPayload | null> {
        const CACHE_KEY = `resolved:${siteId}`;
        const hit = await cache.get<ProjectConfigPayload>(CACHE_KEY);
        if (hit) return hit;

        const site = await prisma.project.findUnique({
            where: { id: siteId },
            select: { activeVersionId: true }
        });
        if (!site || !site.activeVersionId) return null;

        const version = await prisma.configVersion.findUnique({
            where: { versionId: site.activeVersionId }
        });
        if (!version) return null;

        const v = version;
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
        const result = await prisma.$transaction(async (tx: any) => {
            const versionId = crypto.randomUUID();

            // Fetch latest version number
            const latest = await tx.configVersion.findFirst({
                where: { siteId },
                orderBy: { versionNumber: 'desc' },
                select: { versionNumber: true }
            });

            const nextVersion = latest ? latest.versionNumber + 1 : 1;

            // Insert new version
            await tx.configVersion.create({ data: {
                versionId,
                siteId,
                versionNumber: nextVersion,
                status: 'PUBLISHED',
                kpiDefinitionBlob: payload.metrics,
                widgetDefinitionBlob: payload.widgets,
                connectorDefinitionBlob: payload.connectors,
                createdBy: actorId
            }});

            // Update active site pointer safely using ON CONFLICT (upsert paradigm)
            await tx.project.upsert({
                where: { id: siteId },
                create: {
                    id: siteId,
                    tenantId: 'tenant_001',
                    name: siteId,
                    activeVersionId: versionId,
                },
                update: {
                    activeVersionId: versionId,
                    updatedAt: new Date(),
                }
            });

            // Write audit trail
            await AuditService.log({
                action: 'CONFIG_PUBLISHED',
                actorId,
                siteId,
                entityType: 'config_version',
                entityId: versionId,
                metadata: { publishedVersion: nextVersion }
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
        const result = await prisma.$transaction(async (tx: any) => {
            const version = await tx.configVersion.findUnique({
                where: { versionId: targetVersionId },
                select: { versionNumber: true }
            });
            if (!version) throw new Error('Target version not found');

            await tx.project.updateMany({
                where: { id: siteId },
                data: { activeVersionId: targetVersionId, updatedAt: new Date() }
            });

            await AuditService.log({
                action: 'CONFIG_ROLLBACK',
                actorId,
                siteId,
                entityType: 'config_version',
                entityId: targetVersionId,
                metadata: { rollbackToNumber: version.versionNumber }
            });

            return { success: true, activeVersion: version.versionNumber };
        });

        // Invalidate cache immediately after transaction
        await cache.del(`resolved:${siteId}`);
        return result;
    }
}

export const configManager = new ConfigManager();
