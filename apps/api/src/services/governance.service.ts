<<<<<<< HEAD
// import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
// import crypto from 'crypto';
// import { AuditService } from './audit.service';

// export interface ApiUsageRecord {
//     count: number;
//     lastActive: string;
//     errors: number;
//     dataVolumeBytes: number;
// }

// export class GovernanceService {
//     /**
//      * Usage Metrics Store (in-memory mock)
//      * keyId -> Usage Stats
//      */
//     private static keyUsage = new Map<string, ApiUsageRecord>();

//     /**
//      * Increments usage metrics for an API key.
//      */
//     static trackUsage(keyId: string, bytes: number = 0, isError: boolean = false) {
//         const stats = this.keyUsage.get(keyId) || { count: 0, lastActive: '', errors: 0, dataVolumeBytes: 0 };
//         stats.count++;
//         stats.lastActive = new Date().toISOString();
//         stats.dataVolumeBytes += bytes;
//         if (isError) stats.errors++;
//         this.keyUsage.set(keyId, stats);
//     }

//     static getUsage(keyId: string): ApiUsageRecord | null {
//         return this.keyUsage.get(keyId) || null;
//     }

//     /**
//      * Validates and processes an API key lifecycle action.
//      */
//     static async rotateKey(siteId: string, keyId: string, actorId: string) {
//         const keys = GlobalMemoryStore.projectAccessKeys.get(siteId) || [];
//         const keyIndex = keys.findIndex(k => k.id === keyId);
        
//         if (keyIndex === -1) throw new Error('Key not found');

//         const oldKey = keys[keyIndex];
//         const newSecret = `sk_live_${crypto.randomBytes(16).toString('hex')}`;
        
//         // Hashing logic consistent with _p
//         const salt = process.env.JWT_SECRET || 'hardcoded_demo_salt';
//         const hash = crypto.scryptSync(newSecret, salt, 64).toString('hex');

//         keys[keyIndex] = {
//             ...oldKey,
//             secretHash: `${salt}:${hash}`,
//             lastRotatedAt: new Date().toISOString()
//         };

//         await AuditService.log({
//             action: 'API_KEY_ROTATED',
//             actorId,
//             targetId: keyId,
//             status: 'SUCCESS',
//             metadata: { siteId }
//         });

//         return { keyId, newSecret }; // Return new secret ONCE
//     }

//     static async revokeKey(siteId: string, keyId: string, actorId: string) {
//         const keys = GlobalMemoryStore.projectAccessKeys.get(siteId) || [];
//         const keyIndex = keys.findIndex(k => k.id === keyId);
        
//         if (keyIndex === -1) throw new Error('Key not found');

//         keys[keyIndex].status = 'revoked';
//         keys[keyIndex].revokedAt = new Date().toISOString();

//         await AuditService.log({
//             action: 'API_KEY_REVOKED',
//             actorId,
//             targetId: keyId,
//             status: 'SUCCESS',
//             metadata: { siteId }
//         });
//     }

//     static async createKey(siteId: string, actorId: string, body: any) {
//         const id = `ak_${crypto.randomUUID().split('-')[0]}`;
//         const secret = `sk_live_${crypto.randomUUID().replace(/-/g, '')}`;
//         const salt = process.env.JWT_SECRET || 'hardcoded_demo_salt';
//         const hash = crypto.scryptSync(secret, salt, 64).toString('hex');
//         const key = {
//             id,
//             label: body.label || 'New Key',
//             keyPrefix: id.slice(0, 8),
//             secretHash: `${salt}:${hash}`,
//             status: 'active',
//             createdAt: new Date().toISOString(),
//             createdBy: actorId,
//             siteId
//         };
//         const existing = GlobalMemoryStore.projectAccessKeys.get(siteId) || [];
//         existing.push(key as any);
//         GlobalMemoryStore.projectAccessKeys.set(siteId, existing);

//         await AuditService.log({
//             action: 'API_KEY_CREATED',
//             actorId,
//             targetId: id,
//             status: 'SUCCESS',
//             metadata: { siteId }
//         });

//         return { id, secret };
//     }

//     static getAuditLogs(siteId: string) {
//         return GlobalMemoryStore.governanceAuditLogs.filter((l: any) => l.metadata?.siteId === siteId);
//     }

//     /**
//      * Abuse detection: Check for suspicious spikes.
//      */
//     static isSuspicious(keyId: string): boolean {
//         const stats = this.keyUsage.get(keyId);
//         if (!stats) return false;
        
//         // Simple heuristic: > 500 errors in a short window or > 10% error rate
//         if (stats.errors > 500 && (stats.errors / stats.count) > 0.1) {
//             return true;
//         }
//         return false;
//     }
// }

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
                keyHash: `${salt}:${hash}`,
                updatedAt: new Date()
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
                status: 'REVOKED',
                updatedAt: new Date()
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
                OR: [
                    { projectId: siteId },
                    { targetId: siteId }
                ]
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
=======
import crypto from 'crypto';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';

export interface AccessKey {
    id: string;
    label: string;
    prefix: string;
    secretHash: string;
    status: 'active' | 'disabled' | 'revoked' | 'expired';
    environment: 'production' | 'staging' | 'sandbox';
    purpose: string;
    isVip: boolean;
    scopes: string[];
    rateLimit: { max: number, windowMs: number };
    allowedIps: string[];
    createdAt: string;
    lastUsedAt?: string;
    createdBy: string;
}

export class GovernanceService {
    
    public async validateAccessKey(siteId: string, rawKey: string, currentIp: string) {
        const keys = GlobalMemoryStore.projectAccessKeys.get(siteId) || [];
        // Find by simple string match for this demo (in real life, we'd hash the rawKey and compare)
        // For simulation: rawKey = "prefix.secret"
        const [prefix, secret] = rawKey.split('.');
        if (!prefix || !secret) return { valid: false, reason: 'Invalid key format.' };

        const key = keys.find(k => k.prefix === prefix);
        if (!key) return { valid: false, reason: 'Key not found.' };

        // Status check
        if (key.status !== 'active') return { valid: false, reason: `Key status is ${key.status}.` };

        // IP Allowlist Check (CIDR Support)
        if (key.allowedIps && key.allowedIps.length > 0 && !key.allowedIps.includes('0.0.0.0/0')) {
            const isIpAllowed = key.allowedIps.some(range => this.ipMatch(currentIp, range));
            if (!isIpAllowed) {
                this.logEvent(siteId, 'SECURITY_VIOLATION', `Unauthorized IP access attempt: ${currentIp}`, { keyId: key.id });
                return { valid: false, reason: 'IP not allowlisted.' };
            }
        }

        // TIERED RATE LIMITING
        const project = GlobalMemoryStore.projects.get(siteId);
        const globalLimit = project?.globalRateLimit || { max: 1000, windowMs: 60000 };
        
        const now = Date.now();
        const keyBucketKey = `key:${key.id}`;
        const projectBucketKey = `project:${siteId}`;

        // 1. Check Per-Key Limit (Primary Enforcement)
        const keyLimit = this.checkLimit(keyBucketKey, key.rateLimit.max, key.rateLimit.windowMs);
        if (!keyLimit.allowed) {
            return { valid: false, reason: 'Per-key rate limit exceeded.' };
        }

        // 2. Check Project-Level Limit (Fallback Protection)
        const globalLimitCheck = this.checkLimit(projectBucketKey, globalLimit.max, globalLimit.windowMs);
        if (!globalLimitCheck.allowed) {
            // VIP Bypass Logic
            if (key.isVip) {
                console.warn(`[Governance] VIP Key ${key.id} bypassing project limit for ${siteId}`);
                this.logEvent(siteId, 'RATE_LIMIT_BYPASS', `VIP Key detected project breach but bypass allowed`, { keyId: key.id });
                // We still let it pass
            } else {
                this.logEvent(siteId, 'RATE_LIMIT_BREACH', `Project ceiling reached. Blocking normal key: ${key.id}`, { keyId: key.id });
                return { valid: false, reason: 'Project-wide rate limit reached (429).', status: 429 };
            }
        }

        // Update Usage
        key.lastUsedAt = new Date().toISOString();
        return { valid: true, key };
    }

    public async createKey(siteId: string, userId: string, params: any) {
        const secret = crypto.randomBytes(32).toString('hex');
        const prefix = `ak_${crypto.randomBytes(4).toString('hex')}`;
        
        const newKey: AccessKey = {
            id: `key_${crypto.randomUUID()}`,
            label: params.label || 'New Access Key',
            prefix,
            secretHash: this.hashSecret(secret),
            status: 'active',
            environment: params.environment || 'production',
            purpose: params.purpose || '',
            isVip: params.isVip || false,
            scopes: params.scopes || ['ingestion'],
            rateLimit: params.rateLimit || { max: 100, windowMs: 60000 },
            allowedIps: params.allowedIps || ['0.0.0.0/0'],
            createdAt: new Date().toISOString(),
            createdBy: userId
        };

        const keys = GlobalMemoryStore.projectAccessKeys.get(siteId) || [];
        keys.push(newKey);
        GlobalMemoryStore.projectAccessKeys.set(siteId, keys);

        this.logEvent(siteId, 'KEY_CREATED', `New access key "${newKey.label}" created by ${userId}`, { keyId: newKey.id });

        return { key: newKey, rawSecret: secret }; // Secret ONLY returned at creation
    }

    public async rotateKey(siteId: string, keyId: string, userId: string) {
        const keys = GlobalMemoryStore.projectAccessKeys.get(siteId) || [];
        const key = keys.find(k => k.id === keyId);
        if (!key) throw new Error('Key not found');

        const newSecret = crypto.randomBytes(32).toString('hex');
        key.secretHash = this.hashSecret(newSecret);
        key.createdAt = new Date().toISOString(); // Update rotation time
        
        this.logEvent(siteId, 'KEY_ROTATED', `Access key "${key.label}" rotated by ${userId}`, { keyId });
        return { success: true, rawSecret: newSecret };
    }

    public async revokeKey(siteId: string, keyId: string, userId: string) {
        const keys = GlobalMemoryStore.projectAccessKeys.get(siteId) || [];
        const index = keys.findIndex(k => k.id === keyId);
        if (index === -1) throw new Error('Key not found');

        keys[index].status = 'revoked';
        this.logEvent(siteId, 'KEY_REVOKED', `Access key "${keys[index].label}" revoked by ${userId}`, { keyId });
        return { success: true };
    }

    public getAuditLogs(siteId: string) {
        return GlobalMemoryStore.governanceAuditLogs.filter(l => l.siteId === siteId);
    }

    private checkLimit(bucketKey: string, max: number, windowMs: number) {
        const now = Date.now();
        let bucket = GlobalMemoryStore.rateLimitBuckets.get(bucketKey);

        if (!bucket || now > bucket.resetAt) {
            bucket = { count: 1, resetAt: now + windowMs };
            GlobalMemoryStore.rateLimitBuckets.set(bucketKey, bucket);
            return { allowed: true };
        }

        if (bucket.count >= max) {
            return { allowed: false };
        }

        bucket.count++;
        return { allowed: true };
    }

    private logEvent(siteId: string, type: string, message: string, metadata: any) {
        GlobalMemoryStore.governanceAuditLogs.push({
            id: `audit_${crypto.randomUUID()}`,
            siteId,
            type,
            message,
            metadata,
            timestamp: new Date().toISOString()
        });
    }

    private hashSecret(secret: string): string {
        const salt = process.env.JWT_SECRET || 'hardcoded_demo_salt';
        return crypto.scryptSync(secret, salt, 64).toString('hex');
    }

    private ipMatch(ip: string, range: string): boolean {
        if (range === '0.0.0.0/0') return true;
        if (range.includes('/')) {
            // Simple CIDR prefix match for the demo (real production would use subnet math)
            const [subnet] = range.split('/');
            return ip.startsWith(subnet.split('.').slice(0, 2).join('.')); 
        }
        return ip === range;
    }
}

export const governanceService = new GovernanceService();
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
