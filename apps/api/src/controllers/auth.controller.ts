import { AuthService } from '../services/auth.service';
<<<<<<< HEAD
import { prisma } from '@kpi-platform/db';
import { successResponse, errorResponse } from '../utils/response';
=======
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

export const login = async (req: any, reply: any) => {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    
    if (!result) {
<<<<<<< HEAD
        return reply.code(401).send(errorResponse('Invalid credentials', 'AUTH_FAILED'));
    }
    
    return reply.code(200).send(successResponse(result));
};

export const getMe = async (req: any, reply: any) => {
    return reply.code(200).send(successResponse({ user: req.user }));
=======
        return reply.code(401).send({ error: 'Invalid credentials' });
    }
    
    return reply.code(200).send(result);
};

export const getMe = async (req: any, reply: any) => {
    return reply.code(200).send({ user: req.user });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
};

export const getProjects = async (req: any, reply: any) => {
    const userRole = req.user.role;
<<<<<<< HEAD
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
=======
    const assignedIds = req.user.assignedProjects;
    
    const allProjects = Array.from(GlobalMemoryStore.projects.values());
    
    if (userRole === 'SUPER_ADMIN') {
        return reply.code(200).send(allProjects);
    }
    
    const filtered = allProjects.filter(p => assignedIds.includes(p.id));
    return reply.code(200).send(filtered);
};
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
