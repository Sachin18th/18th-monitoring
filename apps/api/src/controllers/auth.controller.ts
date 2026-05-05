import { AuthService } from '../services/auth.service';
import { prisma } from '@kpi-platform/db';
import { successResponse, errorResponse } from '../utils/response';

export const login = async (req: any, reply: any) => {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    
    if (!result) {
        return reply.code(401).send(errorResponse('Invalid credentials', 'AUTH_FAILED'));
    }
    
    return reply.code(200).send(successResponse(result));
};

export const getMe = async (req: any, reply: any) => {
    return reply.code(200).send(successResponse({ user: req.user }));
};

export const getProjects = async (req: any, reply: any) => {
    const userRole = req.user.role;
    const tenantId = req.user.tenantId;
    const assignedIds = req.user.assignedProjects;
    
    // Query projects from database instead of memory
    let allProjects;
    if (userRole === 'SUPER_ADMIN') {
        // SUPER_ADMIN sees everything across all tenants
        allProjects = await prisma.project.findMany();
        return reply.code(200).send(successResponse(allProjects));
    }
    
    // Filter by Tenant first (Isolation)
    let filtered = await prisma.project.findMany({
        where: { tenantId }
    });
    
    // For roles other than TENANT_ADMIN, restrict to assigned projects only
    if (userRole !== 'TENANT_ADMIN') {
        filtered = filtered.filter(p => assignedIds.includes(p.id));
    }
    
    return reply.code(200).send(successResponse(filtered));
};