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
        }
    }
}
