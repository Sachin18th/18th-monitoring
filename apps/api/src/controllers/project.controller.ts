// import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
// import { successResponse, errorResponse } from '../utils/response';
// import crypto from 'crypto';

// export const createProject = async (req: any, reply: any) => {
//     const { name, slug, description } = req.body;
//     const { tenantId } = req.user;

//     if (!name || !slug) {
//         return reply.code(400).send(errorResponse('Name and slug are required.', 'INVALID_INPUT'));
//     }

//     // Check if slug already exists for this tenant
//     const existing = Array.from(GlobalMemoryStore.projects.values())
//         .find(p => p.tenantId === tenantId && p.slug === slug);
    
//     if (existing) {
//         return reply.code(409).send(errorResponse('A project with this slug already exists in your tenant.', 'DUPLICATE_SLUG'));
//     }

//     const projectId = `project_${crypto.randomBytes(4).toString('hex')}`;
//     const now = new Date().toISOString();

//     const newProject = {
//         id: projectId,
//         tenantId,
//         name,
//         slug,
//         description,
//         status: 'ACTIVE',
//         createdAt: now,
//         updatedAt: now,
//         metricsSummary: { activeUsers: 0, errorRate: 0, revenue: 0 }
//     };

//     GlobalMemoryStore.projects.set(projectId, newProject);

//     // Automatically assign the creator to the project if they are not TENANT_ADMIN
//     if (req.user.role !== 'TENANT_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
//         req.user.assignedProjects.push(projectId);
//     }

//     return reply.code(201).send(successResponse(newProject));
// };

// export const updateProject = async (req: any, reply: any) => {
//     const { siteId } = req.params;
//     const updates = req.body;

//     const project = GlobalMemoryStore.projects.get(siteId);
//     if (!project) {
//         return reply.code(404).send(errorResponse('Project not found.', 'NOT_FOUND'));
//     }

//     // Tenant check (Isolation)
//     if (project.tenantId !== req.user.tenantId && req.user.role !== 'SUPER_ADMIN') {
//         return reply.code(403).send(errorResponse('You do not have permission to modify this project.', 'FORBIDDEN'));
//     }

//     const updatedProject = {
//         ...project,
//         ...updates,
//         id: project.id, // Immutable
//         tenantId: project.tenantId, // Immutable
//         updatedAt: new Date().toISOString()
//     };

//     GlobalMemoryStore.projects.set(siteId, updatedProject);
//     return reply.code(200).send(successResponse(updatedProject));
// };

import { prisma } from '@kpi-platform/db';
import { successResponse, errorResponse } from '../utils/response';
import crypto from 'crypto';

export const createProject = async (req: any, reply: any) => {
    const { name, slug, description } = req.body;
    const { tenantId } = req.user;

    if (!name || !slug) {
        return reply.code(400).send(errorResponse('Name and slug are required.', 'INVALID_INPUT'));
    }

    // Check if slug already exists for this tenant
    const existing = await prisma.project.findFirst({
        where: { tenantId, name: slug }
    });
    
    if (existing) {
        return reply.code(409).send(errorResponse('A project with this slug already exists in your tenant.', 'DUPLICATE_SLUG'));
    }

    const projectId = `project_${crypto.randomBytes(4).toString('hex')}`;

    const newProject = await prisma.project.create({
        data: {
            id: projectId,
            tenantId,
            name,
            status: 'ACTIVE',
            environment: 'production',
            settings: { description, slug }
        }
    });

    // Automatically assign the creator to the project if they are not TENANT_ADMIN
    if (req.user.role !== 'TENANT_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
        await prisma.userProjectAccess.create({
            data: { userId: req.user.id, projectId }
        }).catch(() => undefined);
    }

    return reply.code(201).send(successResponse(newProject));
};

export const updateProject = async (req: any, reply: any) => {
    const { siteId } = req.params;
    const updates = req.body;

    const project = await prisma.project.findUnique({ where: { id: siteId } });
    if (!project) {
        return reply.code(404).send(errorResponse('Project not found.', 'NOT_FOUND'));
    }

    // Tenant check (Isolation)
    if (project.tenantId !== req.user.tenantId && req.user.role !== 'SUPER_ADMIN') {
        return reply.code(403).send(errorResponse('You do not have permission to modify this project.', 'FORBIDDEN'));
    }

    const updatedProject = await prisma.project.update({
        where: { id: siteId },
        data: {
            name: updates.name || project.name,
            environment: updates.environment || project.environment,
            status: updates.status || project.status,
            settings: { ...project.settings, ...updates }
        }
    });

    return reply.code(200).send(successResponse(updatedProject));
};