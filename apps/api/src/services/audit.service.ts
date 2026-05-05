import { prisma } from '@kpi-platform/db';
import crypto from 'crypto';

/**
 * AuditService
 *
 * Centralized immutable audit trail for governance and compliance.
 * Tracks all user actions for audit, compliance, and security investigations.
 */
export class AuditService {

    /**
     * Unified audit log method — accepts the flexible event signature
     * used across auth, governance, middleware, and public routes.
     */
    public static async log(params: {
        action: string;
        tenantId?: string;
        siteId?: string;
        projectId?: string;
        actorId?: string;
        actorRole?: string;
        targetId?: string;
        entityType?: string;
        entityId?: string;
        status?: string;
        metadata?: any;
        meta?: any;
    }): Promise<void> {
        try {
            // Only write to database if we have a valid tenantId
            // (to avoid foreign key constraint violations)
            if (params.tenantId) {
                try {
                    const projectId = params.siteId || params.projectId;
                    
                    await prisma.iamAuditLog.create({
                        data: {
                            tenantId: params.tenantId,
                            projectId: projectId,
                            actorId: params.actorId || 'system',
                            action: params.action,
                            targetType: params.entityType || 'unknown',
                            targetId: params.entityId || params.targetId || 'unknown',
                            metadata: params.metadata || params.meta
                        }
                    });
                } catch (dbErr) {
                    // If database is unavailable, fallback to logging only
                    console.error('[AUDIT] Database write failed:', dbErr);
                }
            }

            // Always log to console regardless of DB status
            const statusTag = params.status ? `[${params.status}]` : '';
            console.log(`[AUDIT] ${statusTag} ${params.action} | tenant=${params.tenantId || 'platform'} | site=${params.siteId || params.projectId || params.targetId || 'global'} | actor=${params.actorId || 'system'}`);
        } catch (err) {
            console.error('[AUDIT] Unexpected error in log():', err);
        }
    }

    /**
     * Records an administrative action (legacy alias — prefer log()).
     */
    public static async logAction(params: {
        siteId: string;
        projectId?: string;
        userId: string;
        action: string;
        resource: string;
        details?: any;
    }) {
        return AuditService.log({
            action: params.action,
            actorId: params.userId,
            siteId: params.siteId || params.projectId,
            projectId: params.projectId,
            entityType: 'resource',
            entityId: params.resource,
            metadata: params.details,
            status: 'SUCCESS'
        });
    }

    /**
     * Retrieves audit trail for a project.
     */
    public static async getTrail(tenantId: string) {
        try {
            return await prisma.iamAuditLog.findMany({
                where: { tenantId },
                orderBy: { timestamp: 'desc' },
                take: 1000
            });
        } catch (err) {
            console.error('[AUDIT] Failed to retrieve trail:', err);
            return [];
        }
    }
}
