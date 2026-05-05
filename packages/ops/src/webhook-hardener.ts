import crypto from 'crypto';

export interface WebhookConfig {
    secretVaultKey?: string;
    signatureHeader?: string;
    algorithm?: 'sha256' | 'sha1';
    encoding?: 'hex' | 'base64';
}

export class WebhookHardener {
    /**
     * Verifies the authenticity of an inbound webhook.
     * Requirement 4 (Robust webhook reliability handling)
     */
    static verifySignature(payload: string, headerValue: string, config: WebhookConfig): boolean {
        if (!config.secretVaultKey || !config.signatureHeader) {
            console.warn('[WebhookHardener] Signature validation skipped: No config found.');
            return true; // Assume trusted in dev if not configured
        }

        try {
            // In production, fetch the actual secret from the vault using config.secretVaultKey
            const secret = 'MOCK_SECRET_LOADED_FROM_VAULT'; 
            
            const hmac = crypto.createHmac(config.algorithm || 'sha256', secret);
            const digest = hmac.update(payload).digest(config.encoding || 'hex');
            
            return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(headerValue));
        } catch (err) {
            console.error('[WebhookHardener] Signature verification fatal error:', err);
            return false;
        }
    }

    /**
     * Extracts a unique idempotency key from a webhook payload.
     * Requirement 4 & Requirement 10
     */
    static extractIdempotencyKey(payload: any, path: string): string | null {
        if (!path) return null;
        const keys = path.split('.');
        let current = payload;
        for (const key of keys) {
            if (current && typeof current === 'object') {
                current = current[key];
            } else {
                return null;
            }
        }
        return current?.toString() || null;
    }
}
