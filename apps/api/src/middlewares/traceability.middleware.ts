import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

/**
 * Traceability Middleware
 * 
 * Ensures every incoming request has a unique 'x-correlation-id'.
 * If the client (or upstream service) doesn't provide one, we generate it.
 */
export const traceabilityHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> => {
    const correlationId = request.headers['x-correlation-id'] as string || crypto.randomUUID();
    
    // Inject into request object for service access
    (request as any).correlationId = correlationId;

    // Inject into response headers so the client/monitoring can track it
    reply.header('x-correlation-id', correlationId);
    
    // Log the initiation of the request with context
    // console.log(`[TRACE] Request Start: ${request.method} ${request.url} | cid=${correlationId}`);
};
