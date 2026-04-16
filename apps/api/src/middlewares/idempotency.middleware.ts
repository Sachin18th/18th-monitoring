/**
 * Idempotency Middleware
 *
 * Prevents duplicate processing of retried/replayed requests on mutating endpoints.
 * Clients must send `Idempotency-Key: <uuid>` on every POST/PATCH.
 *
 * PRODUCTION NOTE: Replace the in-process Map with a Redis SET with SETNX + TTL
 * to support distributed API instances.
 *
 * Flow:
 *   1. Extract Idempotency-Key from header
 *   2. If seen → return 409 Conflict (or original cached response)
 *   3. If new → store key, allow request, mark complete
 */

import { FastifyRequest, FastifyReply } from 'fastify';

interface IdempotencyRecord {
    status: 'IN_PROGRESS' | 'COMPLETE';
    response?: any;
    timestamp: number;
}

// In-process store — swap for Redis SETNX in production
const store = new Map<string, IdempotencyRecord>();
const IDEMPOTENCY_TTL_MS = parseInt(process.env.IDEMPOTENCY_TTL_MS || String(24 * 60 * 60 * 1000)); // 24 h

// Sweep stale keys periodically
setInterval(() => {
    const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
    for (const [key, rec] of store.entries()) {
        if (rec.timestamp < cutoff) store.delete(key);
    }
}, 60 * 60 * 1000).unref(); // every hour

export const idempotencyGuard = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    if (!idempotencyKey) {
        return reply.status(400).send({
            error: 'Bad Request',
            message: 'Idempotency-Key header is required for mutating requests.',
        });
    }

    const existing = store.get(idempotencyKey);

    if (existing) {
        if (existing.status === 'IN_PROGRESS') {
            return reply.status(409).send({
                error: 'Conflict',
                message: 'A request with this Idempotency-Key is already in progress.',
            });
        }
        // Return cached response for already-completed operation
        return reply.status(200).send(existing.response);
    }

    // Mark as in-progress
    store.set(idempotencyKey, { status: 'IN_PROGRESS', timestamp: Date.now() });

    // Hook into response lifecycle to capture and cache the response
    reply.addHook?.('onSend', async (_req: any, _reply: any, payload: any) => {
        store.set(idempotencyKey, {
            status: 'COMPLETE',
            response: typeof payload === 'string' ? JSON.parse(payload) : payload,
            timestamp: Date.now(),
        });
        return payload;
    });
};
