import { prisma } from '@kpi-platform/db';
import crypto from 'crypto';
import { AuditService } from './audit.service';

export interface ApiUsageRecord {
    count: number;
    lastActive: string;
    errors: number;
    dataVolumeBytes: number;
}

export class GovernanceService {
    /**
     * Usage Metrics Store (in-memory mock)
     * keyId -> Usage Stats
     */
    private static keyUsage = new Map<string, ApiUsageRecord>();

    /**
     * Increments usage metrics for an API key.
     */
    static trackUsage(keyId: string, bytes: number = 0, isError: boolean = false) {
        const stats = this.keyUsage.get(keyId) || { count: 0, lastActive: '', errors: 0, dataVolumeBytes: 0 };
        stats.count++;
        stats.lastActive = new Date().toISOString();
        stats.dataVolumeBytes += bytes;
        if (isError) stats.errors++;
        this.keyUsage.set(keyId, stats);
    }

    static getUsage(keyId: string): ApiUsageRecord | null {
        return this.keyUsage.get(keyId) || null;
    }

    /**
     * Validates and processes an API key lifecycle action.
     */
    static async rotateKey(siteId: string, keyId: string, actorId: string) {
        const key = await prisma.projectAccessKey.findUnique({
            where: { id: keyId }
        });
        
        if (!key) throw new Error('Key not found');

        const newSecret = `sk_live_${crypto.randomBytes(16).toString('hex')}`;
        const salt = process.env.JWT_SECRET || 'hardcoded_demo_salt';
        const hash = crypto.scryptSync(newSecret, salt, 64).toString('hex');

        await prisma.projectAccessKey.update({
            where: { id: keyId },
            data: {
                keyHash: `${salt}:${hash}`
            }
        });

        await AuditService.log({
            action: 'API_KEY_ROTATED',
            tenantId: key.tenantId,
            siteId,
            projectId: siteId,
            actorId,
            targetId: keyId,
            status: 'SUCCESS',
            metadata: { siteId }
        });

        return { keyId, newSecret }; // Return new secret ONCE
    }

    static async revokeKey(siteId: string, keyId: string, actorId: string) {
        const key = await prisma.projectAccessKey.findUnique({
            where: { id: keyId }
        });
        
        if (!key) throw new Error('Key not found');

        await prisma.projectAccessKey.update({
            where: { id: keyId },
            data: {
                status: 'REVOKED'
            }
        });

        await AuditService.log({
            action: 'API_KEY_REVOKED',
            tenantId: key.tenantId,
            siteId,
            projectId: siteId,
            actorId,
            targetId: keyId,
            status: 'SUCCESS',
            metadata: { siteId }
        });
    }

    static async createKey(siteId: string, actorId: string, body: any) {
        const id = `ak_${crypto.randomUUID().split('-')[0]}`;
        const secret = `sk_live_${crypto.randomUUID().replace(/-/g, '')}`;
        const salt = process.env.JWT_SECRET || 'hardcoded_demo_salt';
        const hash = crypto.scryptSync(secret, salt, 64).toString('hex');

        const key = await prisma.projectAccessKey.create({
            data: {
                id,
                label: body.label || 'New Key',
                keyPrefix: secret.slice(0, 7),
                keyHash: `${salt}:${hash}`,
                status: 'ACTIVE',
                siteId: siteId,
                tenantId: body.tenantId || 'unknown',
                createdBy: actorId || 'system',
                scopes: body.scopes || []
            }
        });

        await AuditService.log({
            action: 'API_KEY_CREATED',
            tenantId: body.tenantId,
            siteId,
            projectId: siteId,
            actorId,
            targetId: id,
            status: 'SUCCESS',
            metadata: { siteId }
        });

        return { id, secret };
    }

    static async getAuditLogs(siteId: string) {
        return prisma.iamAuditLog.findMany({
            where: {
                project: {
                    is: { id: siteId }
                }
            },
            orderBy: { timestamp: 'desc' },
            take: 1000
        });
    }

    /**
     * Abuse detection: Check for suspicious spikes.
     */
    static isSuspicious(keyId: string): boolean {
        const stats = this.keyUsage.get(keyId);
        if (!stats) return false;
        
        // Simple heuristic: > 500 errors in a short window or > 10% error rate
        if (stats.errors > 500 && (stats.errors / stats.count) > 0.1) {
            return true;
        }
        return false;
    }
}
