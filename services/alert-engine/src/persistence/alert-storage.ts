<<<<<<< HEAD
import { randomUUID } from 'crypto';
import { prisma } from '@kpi-platform/db';

const alertCache: any[] = [];
=======
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { DatabaseFactory } from '../../../../packages/db/src';

const db = DatabaseFactory.getRelationalDb();
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

export interface AlertPayload {
    ruleId: string;
    siteId: string;          // Required for per-tenant alert isolation
    kpiName: string;
    message: string;
    severity: string;
    status: string;
    triggeredAt: string;
<<<<<<< HEAD
    context?: Record<string, any>;
    resolvedAt?: string;
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
}

export type AlertStatus = 'triggered' | 'active' | 'acknowledged' | 'resolved';

<<<<<<< HEAD
const normalizeAlertRecord = (alert: any): any => ({
    alertId: alert.id,
    ruleId: alert.correlationId ?? alert.ruleId ?? '',
    siteId: alert.siteId,
    kpiName: alert.context?.kpiName ?? alert.alertType ?? '',
    status: alert.status,
    severity: alert.severity,
    triggerValue: alert.context?.triggerValue,
    thresholdValue: alert.context?.thresholdValue,
    message: alert.message,
    triggeredAt: alert.triggeredAt instanceof Date ? alert.triggeredAt.toISOString() : new Date(alert.triggeredAt).toISOString(),
    resolvedAt: alert.resolvedAt ? (alert.resolvedAt instanceof Date ? alert.resolvedAt.toISOString() : new Date(alert.resolvedAt).toISOString()) : undefined,
    context: alert.context ?? undefined,
});

const upsertCachedAlert = (record: any) => {
    const index = alertCache.findIndex((item) => item.alertId === record.alertId);
    if (index >= 0) {
        alertCache[index] = record;
        return;
    }

    alertCache.push(record);
};

export class AlertStorage {
    // Migrated from Drizzle ORM to Prisma
    static async saveAlert(alert: AlertPayload): Promise<void> {
        const project = await prisma.project.findUnique({
            where: { id: alert.siteId },
            select: { tenantId: true },
        });

        if (!project) {
            throw new Error(`Project not found for siteId ${alert.siteId}`);
        }

        const existing = await prisma.alert.findFirst({
            where: {
                siteId: alert.siteId,
                correlationId: alert.ruleId,
                status: 'active',
            },
            select: { id: true },
        });

        if (existing) {
            return;
        }

        const alertId = (alert as any).alertId || randomUUID();
        const persisted = await prisma.alert.create({
            data: {
                id: alertId,
                siteId: alert.siteId,
                tenantId: project.tenantId,
                severity: alert.severity,
                status: alert.status === 'resolved' ? 'resolved' : 'active',
                module: 'alert-engine',
                alertType: alert.kpiName,
                message: alert.message,
                context: {
                    ...(alert.context ?? {}),
                    ruleId: alert.ruleId,
                    kpiName: alert.kpiName,
                    triggerValue: (alert as any).triggerValue,
                    thresholdValue: (alert as any).thresholdValue,
                },
                correlationId: alert.ruleId,
                triggeredAt: new Date(alert.triggeredAt),
                resolvedAt: alert.resolvedAt ? new Date(alert.resolvedAt) : undefined,
            },
        });

        upsertCachedAlert(normalizeAlertRecord(persisted));
    }

    // Migrated from Drizzle ORM to Prisma
    static async updateStatus(alertId: string, status: AlertStatus): Promise<void> {
        const resolvedAt = status === 'resolved' ? new Date() : undefined;

        await prisma.alert.updateMany({
            where: { id: alertId },
            data: {
                status,
                ...(resolvedAt ? { resolvedAt } : {}),
            },
        });

        const cachedAlert = alertCache.find((item) => item.alertId === alertId);
        if (cachedAlert) {
            cachedAlert.status = status;
            if (resolvedAt) {
                cachedAlert.resolvedAt = resolvedAt.toISOString();
            }
        }
    }

    // Migrated from Drizzle ORM to Prisma
    static getAll(): any[] {
        return alertCache;
=======
export class AlertStorage {
    static async saveAlert(alert: AlertPayload): Promise<void> {
        await db.saveAlertState(alert);
    }

    static async updateStatus(alertId: string, status: AlertStatus): Promise<void> {
        const alert = GlobalMemoryStore.alerts.find(a => a.alertId === alertId);
        if (alert) {
            alert.status = status;
            console.log(`[AlertStorage] Alert ${alertId} → ${status}`);
        }
    }

    static getAll(): any[] {
        return GlobalMemoryStore.alerts;
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
}
