// /**
//  * Tenant Isolation Middleware (Hardened)
//  *
//  * Enforces strict hierarchy: Platform > Tenant > Project.
//  * 
//  * Logic:
//  * 1. Extract tenantId and siteId from request/session.
//  * 2. If SUPER_ADMIN, allow global access.
//  * 3. Verify that the requested siteId belongs to the user's tenantId.
//  * 4. Verify that the user has explicit access to the siteId (if they are not a Tenant Admin).
//  */

// import { FastifyRequest, FastifyReply } from 'fastify';
// import { errorResponse } from '../utils/response';
// import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';

// export const tenantIsolationGuard = async (
//     request: FastifyRequest<{ Params: { siteId?: string } }>,
//     reply: FastifyReply
// ): Promise<void> => {
//     const user = (request as any).user;
//     const { siteId } = request.params;
//     const querySiteId = (request.query as any).siteId;
//     const targetSiteId = siteId || querySiteId;

//     if (!user) {
//         return reply.status(401).send(errorResponse('Authentication required.', 'UNAUTHORIZED'));
//     }

//     // SUPER_ADMIN bypasses all tenant boundaries
//     if (user.role === 'SUPER_ADMIN') return;

//     // 1. Cross-Tenant Leakage Check
//     // If a siteId is targeted, it MUST belong to the user's tenantId.
//     if (targetSiteId) {
//         // Fallback to GlobalMemoryStore if DB not initialized
//         const project = GlobalMemoryStore.projects.get(targetSiteId);
        
//         if (!project || project.tenantId !== user.tenantId) {
//             console.error(`[SECURITY] Tenant mismatch attempt: user_tenant=${user.tenantId} target_site=${targetSiteId}`);
//             return reply.status(403).send(errorResponse('Cross-tenant access detected. This action has been logged.', 'FORBIDDEN_TENANT_MISMATCH'));
//         }
//     }

//     // 2. Project Assignment Check
//     // Even within a tenant, many users only have access to specific projects.
//     // TENANT_ADMIN bypasses project-level assignment within their tenant
//     if (targetSiteId && user.role !== 'TENANT_ADMIN') {
//         if (!Array.isArray(user.assignedProjects) || !user.assignedProjects.includes(targetSiteId)) {
//             return reply.status(403).send(errorResponse(`Access denied. You are not assigned to project "${targetSiteId}".`, 'FORBIDDEN_PROJECT_ACCESS'));
//         }
//     }
// };

/**
 * Tenant Isolation Middleware (Hardened)
 *
 * Enforces strict hierarchy: Platform > Tenant > Project.
 * 
 * Logic:
 * 1. Extract tenantId and siteId from request/session.
 * 2. If SUPER_ADMIN, allow global access.
 * 3. Verify that the requested siteId belongs to the user's tenantId.
 * 4. Verify that the user has explicit access to the siteId (if they are not a Tenant Admin).
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { errorResponse } from '../utils/response';
import { prisma } from '@kpi-platform/db';

export const tenantIsolationGuard = async (
    request: FastifyRequest<{ Params: { siteId?: string } }>,
    reply: FastifyReply
): Promise<void> => {
    const user = (request as any).user;
    const { siteId } = request.params;
    const querySiteId = (request.query as any).siteId;
    const targetSiteId = siteId || querySiteId;

    if (!user) {
        return reply.status(401).send(errorResponse('Authentication required.', 'UNAUTHORIZED'));
    }

    // SUPER_ADMIN bypasses all tenant boundaries
    if (user.role === 'SUPER_ADMIN') return;

    // 1. Cross-Tenant Leakage Check
    // If a siteId is targeted, it MUST belong to the user's tenantId.
    if (targetSiteId) {
        const project = await prisma.project.findUnique({
            where: { id: targetSiteId },
            select: { id: true, tenantId: true }
        });
        
        if (!project || project.tenantId !== user.tenantId) {
            console.error(`[SECURITY] Tenant mismatch attempt: user_tenant=${user.tenantId} target_site=${targetSiteId}`);
            return reply.status(403).send(errorResponse('Cross-tenant access detected. This action has been logged.', 'FORBIDDEN_TENANT_MISMATCH'));
        }
    }

    // 2. Project Assignment Check
    // Even within a tenant, many users only have access to specific projects.
    // TENANT_ADMIN bypasses project-level assignment within their tenant
    if (targetSiteId && user.role !== 'TENANT_ADMIN') {
        if (!Array.isArray(user.assignedProjects) || !user.assignedProjects.includes(targetSiteId)) {
            return reply.status(403).send(errorResponse(`Access denied. You are not assigned to project "${targetSiteId}".`, 'FORBIDDEN_PROJECT_ACCESS'));
        }
    }
};