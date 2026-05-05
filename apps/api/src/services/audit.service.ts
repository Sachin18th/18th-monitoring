<<<<<<< HEAD
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
=======
/**
 * AuditService — Phase 4 Enhanced
 *
 * Writes structured audit events to:
 *   1. Postgres `audit_logs` table (durable, queryable)
 *   2. stdout (structured JSON for log aggregators — Datadog, Splunk, CloudWatch)
 *
 * Covers all auditability domains:
 *   - CONFIG_*         config publish / rollback / draft
 *   - SYNC_*           connector sync start / complete / fail
 *   - IMPORT_*         CSV import submit / complete / fail
 *   - RECON_*          reconciliation trigger / complete
 *   - API_ACCESS       public/admin API access events
 */

import crypto from 'crypto';
import { db } from '../../../../packages/db/src/adapters/postgres-relational.adapter';
import { auditLogs } from '../../../../packages/db/src/drizzle/schema';

export type AuditAction =
    | 'CONFIG_PUBLISHED' | 'CONFIG_ROLLBACK' | 'CONFIG_DRAFT_CREATED'
    | 'SYNC_STARTED'     | 'SYNC_COMPLETED'  | 'SYNC_FAILED'
    | 'IMPORT_SUBMITTED' | 'IMPORT_COMPLETED' | 'IMPORT_FAILED'
    | 'RECON_TRIGGERED'  | 'RECON_COMPLETED'
    | 'API_ACCESS'       | 'AUTH_LOGIN'       | 'AUTH_FAILURE';

export interface AuditEvent {
    action:      AuditAction;
    actorId:     string;
    siteId:      string;
    entityType:  string;
    entityId:    string;
    changes?:    Record<string, any>;
    status?:     'SUCCESS' | 'FAILURE' | 'PENDING';
    meta?:       Record<string, any>;
}

export class AuditService {
    static async log(event: AuditEvent): Promise<void> {
        const logId = crypto.randomUUID();
        const timestamp = new Date();

        const entry = {
            action:     event.action,
            actorId:    event.actorId,
            siteId:     event.siteId,
            entityType: event.entityType,
            entityId:   event.entityId,
            changes:    event.changes    ?? {},
            status:     event.status     ?? 'SUCCESS',
            meta:       event.meta       ?? {},
            timestamp:  timestamp.toISOString(),
            service:    'kpi-monitoring-api',
        };

        // 1. Structured stdout — parsed by log aggregators
        console.log(`[AUDIT] ${JSON.stringify(entry)}`);

        // 2. Persist to Postgres with Memory Fallback
        try {
            await db.insert(auditLogs).values({
                siteId:     event.siteId,
                actorId:    event.actorId,
                action:     event.action,
                entityType: event.entityType,
                entityId:   event.entityId,
                changes:    { ...event.changes, status: entry.status, meta: entry.meta },
            });
        } catch (err) {
            // Fallback to GlobalMemoryStore if DB fails
            console.error('[AuditService] Persistence failed, falling back to MemoryStore:', (err as any).message);
            const { GlobalMemoryStore } = require('../../../../packages/db/src/adapters/in-memory.adapter');
            GlobalMemoryStore.governanceAuditLogs.push({
                ...entry,
                logId
            });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        }
    }
}
