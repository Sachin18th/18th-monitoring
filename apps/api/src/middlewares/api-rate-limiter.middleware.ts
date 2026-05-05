import { FastifyRequest, FastifyReply } from 'fastify';
import { ResponseUtil } from '../utils/response';

interface RateLimitData {
    count: number;
    resetAt: number;
}

// In-memory store for API Key windows
const keyWindows = new Map<string, RateLimitData>();

/**
 * Advanced Rate Limiter for the Exposure Layer.
 * Supports Tiered limits (Standard vs VIP) and returns quota headers.
 */
export const apiRateLimiter = async (req: any, reply: FastifyReply) => {
    // Only apply to API Key authenticated requests
    if (req.authMode !== 'API_KEY') return;

    const user = req.user;
    const keyId = user.apiKeyId || user.id;
    
    // Tier-based configuration
    // Default: 100 req/min
    // VIP: 5000 req/min
    const isVip = user.isVip === true;
    const limit = isVip ? 5000 : 100;
    const windowMs = 60_000; // 1 minute window

    const now = Date.now();
    let data = keyWindows.get(keyId);

    if (!data || now > data.resetAt) {
        data = {
            count: 0,
            resetAt: now + windowMs
        };
    }

    data.count++;
    keyWindows.set(keyId, data);

    const remaining = Math.max(0, limit - data.count);
    
    // Set Quota Headers
    reply.header('X-RateLimit-Limit', String(limit));
    reply.header('X-RateLimit-Remaining', String(remaining));
    reply.header('X-RateLimit-Reset', String(Math.ceil(data.resetAt / 1000)));

    if (data.count > limit) {
        return reply.status(429).send(ResponseUtil.error([{
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Tier: ${isVip ? 'VIP' : 'Standard'}. Limit: ${limit}/min.`,
            category: 'rate_limited'
        }], req.id as string));
    }
};

// Cleanup task
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of keyWindows.entries()) {
        if (now > data.resetAt) keyWindows.delete(key);
    }
}, 60_000);
