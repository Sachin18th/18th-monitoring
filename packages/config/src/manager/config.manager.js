"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configManager = exports.ConfigManager = void 0;
// Assume db exposes drizzle db instance matching schema
const postgres_relational_adapter_1 = require("../../../db/src/adapters/postgres-relational.adapter");
const schema_1 = require("../../../db/src/drizzle/schema");
const crypto_1 = __importDefault(require("crypto"));
const drizzle_orm_1 = require("drizzle-orm");
const src_1 = require("../../../../packages/cache/src");
const audit_service_1 = require("../../../../apps/api/src/services/audit.service");
class ConfigManager {
    /**
     * Get the actively published configuration.
     * Cached with TTL.RESOLVED_CONFIG.
     */
    async getResolvedConfig(siteId) {
        const CACHE_KEY = `resolved:${siteId}`;
        const hit = await src_1.cache.get(CACHE_KEY);
        if (hit)
            return hit;
        const site = await postgres_relational_adapter_1.db.select().from(schema_1.projects).where((0, drizzle_orm_1.eq)(schema_1.projects.id, siteId)).limit(1);
        if (!site.length || !site[0].activeVersionId)
            return null;
        const version = await postgres_relational_adapter_1.db.select().from(schema_1.configVersions).where((0, drizzle_orm_1.eq)(schema_1.configVersions.versionId, site[0].activeVersionId)).limit(1);
        if (!version.length)
            return null;
        const v = version[0];
        const result = {
            tracking: {},
            sampling: { rate: 100 },
            metrics: v.kpiDefinitionBlob,
            widgets: v.widgetDefinitionBlob,
            connectors: v.connectorDefinitionBlob,
            orderSourceRules: []
        };
        await src_1.cache.set(CACHE_KEY, result, src_1.TTL.RESOLVED_CONFIG);
        return result;
    }
    /**
     * Commits a draft payload to a new version and marks it active.
     */
    async publishDraft(siteId, actorId, payload) {
        const result = await postgres_relational_adapter_1.db.transaction(async (tx) => {
            const versionId = crypto_1.default.randomUUID();
            // Fetch latest version number
            const latest = await tx.select()
                .from(schema_1.configVersions)
                .where((0, drizzle_orm_1.eq)(schema_1.configVersions.siteId, siteId))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.configVersions.versionNumber))
                .limit(1);
            const nextVersion = latest.length > 0 ? latest[0].versionNumber + 1 : 1;
            // Insert new version
            await tx.insert(schema_1.configVersions).values({
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
            await tx.insert(schema_1.projects).values({
                id: siteId,
                activeVersionId: versionId,
            }).onConflictDoUpdate({
                target: schema_1.projects.id,
                set: { activeVersionId: versionId, updatedAt: new Date() }
            });
            // Write audit trail
            await audit_service_1.AuditService.log({
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
        await src_1.cache.del(`resolved:${siteId}`);
        return result;
    }
    /**
     * Reverts to a historic version ID.
     */
    async rollbackToVersion(siteId, actorId, targetVersionId) {
        const result = await postgres_relational_adapter_1.db.transaction(async (tx) => {
            const version = await tx.select().from(schema_1.configVersions).where((0, drizzle_orm_1.eq)(schema_1.configVersions.versionId, targetVersionId)).limit(1);
            if (!version.length)
                throw new Error('Target version not found');
            await tx.update(schema_1.projects)
                .set({ activeVersionId: targetVersionId, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.projects.id, siteId));
            await audit_service_1.AuditService.log({
                action: 'CONFIG_ROLLBACK',
                actorId,
                siteId,
                entityType: 'config_version',
                entityId: targetVersionId,
                metadata: { rollbackToNumber: version[0].versionNumber }
            });
            return { success: true, activeVersion: version[0].versionNumber };
        });
        // Invalidate cache immediately after transaction
        await src_1.cache.del(`resolved:${siteId}`);
        return result;
    }
}
exports.ConfigManager = ConfigManager;
exports.configManager = new ConfigManager();
