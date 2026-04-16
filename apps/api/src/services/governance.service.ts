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
