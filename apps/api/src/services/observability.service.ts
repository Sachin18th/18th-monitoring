import { prisma } from '@kpi-platform/db';
import { getSiteDataPlaneClient } from '../lib/tenant-prisma';
import {
    SystemAlert,
    AlertSeverity,
    LogLevel,
    StructuredLog
} from '../../../../packages/shared-types/src';
import crypto from 'crypto';

export class ObservabilityService {
    
    /**
     * Requirement 1: Structured Logging
     * Persists a log entry with full operational context.
     */
    static async log(entry: Omit<StructuredLog, 'timestamp'>) {
        // Migrated from Drizzle ORM to Prisma
        // systemLog table removed — query neutralized

        // If ERROR or FATAL, automatically check if we should trigger an alert
        if (entry.level === 'ERROR' || entry.level === 'FATAL') {
            await this.triggerAlert({
                siteId: entry.siteId || 'SYSTEM',
                severity: entry.level === 'FATAL' ? 'CRITICAL' : 'WARNING',
                module: entry.module as any,
                alertType: 'ERROR_LOG_SPIKE',
                message: entry.message,
                context: entry.metadata,
                correlationId: entry.correlationId
            });
        }
    }

    /**
     * Requirement 7, 8, 10: Alert Rule Engine & Lifecycle
     */
    static async triggerAlert(alertData: Omit<SystemAlert, 'id' | 'status' | 'triggeredAt'>) {
        // Migrated from Drizzle ORM to Prisma
        const id = crypto.randomUUID();
        
        // Alerts are store-payload data → the site's primary store DB (control DB
        // when the data plane is off, or for the special 'SYSTEM' site which has
        // no store DB and falls back to control).
        const db = await getSiteDataPlaneClient(alertData.siteId);

        // 1. DEDUPLICATION (Requirement 9)
        // Check if a similar alert is already active for this site/module/type
        const existing = await db.alert.findFirst({
            where: {
                siteId: alertData.siteId,
                module: alertData.module,
                alertType: alertData.alertType,
                status: 'TRIGGERED'
            }
        });

        if (existing) {
            // Already triggered, could increment a counter in metadata
            return existing.id;
        }

        // 2. PERSIST NEW ALERT
        await db.alert.create({
            data: {
                id,
                siteId: alertData.siteId,
                tenantId: (alertData as any).tenantId || 'tenant_001',
                severity: alertData.severity,
                module: alertData.module,
                alertType: alertData.alertType,
                message: alertData.message,
                context: alertData.context || {},
                correlationId: alertData.correlationId,
                status: 'TRIGGERED'
            }
        });

        console.log(`[Alerting] Triggered ${alertData.severity} alert for ${alertData.siteId}: ${alertData.message}`);
        return id;
    }

    /**
     * Requirement 12: Immutable Audit Logging
     */
    static async audit(options: {
        siteId: string;
        tenantId?: string;
        connectorInstanceId?: string;
        actorId: string;
        action: string;
        entityType: string;
        entityId: string;
        previousValue?: any;
        newValue?: any;
        metadata?: Record<string, any>;
    }) {
        // Migrated from Drizzle ORM to Prisma
        await prisma.iamAuditLog.create({
            data: {
                tenantId: options.tenantId || 'tenant_001',
                projectId: options.siteId,
                connectorInstanceId: options.connectorInstanceId,
                actorId: options.actorId,
                action: options.action,
                targetType: options.entityType,
                targetId: options.entityId,
                metadata: {
                    from: options.previousValue,
                    to: options.newValue,
                    ...options.metadata
                }
            }
        });
    }

    /**
     * Requirement 10: Alert Resolution
     */
    static async resolveAlert(alertId: string, resolvedBy: string) {
        // NOTE: no siteId here, so this can't resolve routing to a store DB. It is
        // currently unused; if revived, pass the site so it can target the same
        // store DB triggerAlert wrote to (see findInSiteClients in tenant-prisma).
        await prisma.alert.updateMany({
            where: { id: alertId },
            data: {
                status: 'RESOLVED',
                resolvedAt: new Date(),
                acknowledgedBy: resolvedBy
            }
        });
    }
}
