/**
 * Tenant Isolation Middleware
 *
 * Enforces that every request to a :siteId-scoped endpoint belongs to a project
 * the authenticated user is actually assigned to.
 *
 * Rules:
 *   - SUPER_ADMIN: bypass — can access any site.
 *   - ADMIN / CUSTOMER: must have siteId in assignedProjects.
 *   - Missing user (unauthenticated): always reject (auth middleware runs first).
 *
 * PRODUCTION NOTE: In a multi-region setup, cache the user's project membership
 * in Redis (keyed by userId) to avoid a DB lookup on every request.
 */

import { FastifyRequest, FastifyReply } from 'fastify';

export const tenantIsolationGuard = async (
    request: FastifyRequest<{ Params: { siteId?: string } }>,
    reply: FastifyReply
): Promise<void> => {
    const user = (request as any).user;
    const { siteId } = request.params;

    // No siteId param → this guard is not applicable (global endpoints)
    if (!siteId) return;

    // Unauthenticated — should have been rejected by tenantAuthHandler first
    if (!user) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required.' });
    }

    // SUPER_ADMIN bypasses all tenant boundaries
    if (user.role === 'SUPER_ADMIN') return;

    // All other roles must be explicitly assigned to the requested site
    if (!Array.isArray(user.assignedProjects) || !user.assignedProjects.includes(siteId)) {
        return reply.status(403).send({
            error: 'Forbidden',
            message: `Access denied. You are not assigned to project "${siteId}".`,
        });
    }
};
