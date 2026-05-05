<<<<<<< HEAD
// import { prisma } from '@kpi-platform/db';
// import { AuthService } from '../services/auth.service';
// import crypto from 'crypto';

// export const listPlatformUsers = async (req: any, reply: any) => {
//     const { projectId } = req.params;
    
//     // Additional security for non-SuperAdmins
//     if (req.user.role !== 'SUPER_ADMIN' && !req.user.assignedProjects.includes(projectId)) {
//         return reply.code(403).send({ error: 'Forbidden', message: 'You do not have access to this project administration.' });
//     }

//     const users = await prisma.user.findMany({
//         where: {
//               projectAccess: {
//                 some: { projectId }
//             }
//         },
//         select: {
//             id: true,
//             email: true,
//             name: true,
//             role: true,
//             status: true,
//             createdAt: true,
//             updatedAt: true
//         }
//     });

//     return users;
// };

// export const createPlatformUser = async (req: any, reply: any) => {
//     const { projectId } = req.params;
//     const { email, name, password } = req.body;

//     if (!email || !password || !name) {
//         return reply.code(400).send({ error: 'Missing fields' });
//     }

//     // Security check
//     if (req.user.role !== 'SUPER_ADMIN' && !req.user.assignedProjects.includes(projectId)) {
//         return reply.code(403).send({ error: 'Forbidden' });
//     }

//     try {
//         const passwordHash = await AuthService.hashPassword(password);
//         const tenantId = req.user.tenantId;
        
//         const newUser = await prisma.user.create({
//             data: {
//                 id: crypto.randomUUID(),
//                 email,
//                 name,
//                 tenantId,
//                 passwordHash,
//                 role: 'USER',
//                 status: 'ACTIVE'
//             } as any
//         });

//         // Assign user to the project
//         await prisma.userProjectAccess.create({
//             data: {
//                 userId: newUser.id,
//                 projectId
//             }
//         });
        
//         const { passwordHash: _, ...userWithoutPass } = newUser;
//         return reply.code(201).send(userWithoutPass);
//     } catch (e: any) {
//         return reply.code(400).send({ error: e.message });
//     }
// };

// export const updatePlatformUserStatus = async (req: any, reply: any) => {
//     const { userId } = req.params;
//     const { status } = req.body;

//     if (!['ACTIVE', 'INACTIVE'].includes(status)) {
//         return reply.code(400).send({ error: 'Invalid status' });
//     }

//     try {
//         const updated = await prisma.user.update({
//             where: { id: userId },
//             data: { status },
//             select: {
//                 id: true,
//                 email: true,
//                 name: true,
//                 status: true
//             }
//         });
//         return { success: true, user: updated };
//     } catch (e: any) {
//         return reply.code(404).send({ error: e.message });
//     }
// };

// export const purgeDemoData = async (req: any, reply: any) => {
//     // Only Super Admins can purge demo data
//     if (req.user.role !== 'SUPER_ADMIN') {
//         return reply.code(403).send({ error: 'Forbidden', message: 'Only Super Admins can perform this action.' });
//     }

//     try {
//         // Delete all demo data from database (orders, events, logs)
//         await Promise.all([
//             prisma.canonicalOrder.deleteMany({}),
//             prisma.ingestionEvent.deleteMany({}),
//             prisma.kpiValue.deleteMany({})
//         ]);
        
//         return { success: true, message: 'Demo data purged successfully.' };
//     } catch (e: any) {
//         return reply.code(500).send({ error: 'Purge failed', message: e.message });
//     }
// };

import { prisma } from '@kpi-platform/db';
import { AuthService } from '../services/auth.service';
import crypto from 'crypto';

export const listPlatformUsers = async (req: any, reply: any) => {
    const { projectId } = req.params;
    
    // Additional security for non-SuperAdmins
    if (req.user.role !== 'SUPER_ADMIN' && !req.user.assignedProjects.includes(projectId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'You do not have access to this project administration.' });
    }

    const users = await prisma.user.findMany({
        where: {
              projectAccess: {
                some: { projectId }
            }
        },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true
        }
    });

    return users;
};

export const createPlatformUser = async (req: any, reply: any) => {
    const { projectId } = req.params;
    const { email, name, password } = req.body;

    if (!email || !password || !name) {
        return reply.code(400).send({ error: 'Missing fields' });
    }

    // Security check
    if (req.user.role !== 'SUPER_ADMIN' && !req.user.assignedProjects.includes(projectId)) {
        return reply.code(403).send({ error: 'Forbidden' });
    }

    try {
        const passwordHash = await AuthService.hashPassword(password);
        const tenantId = req.user.tenantId;
        
        const newUser = await prisma.user.create({
            data: {
                id: crypto.randomUUID(),
                email,
                name,
                tenantId,
                passwordHash,
                role: 'USER',
                status: 'ACTIVE'
            } as any
        });

        // Assign user to the project
        await prisma.userProjectAccess.create({
            data: {
                userId: newUser.id,
                projectId
            }
        });
        
        const { passwordHash: _, ...userWithoutPass } = newUser;
        return reply.code(201).send(userWithoutPass);
    } catch (e: any) {
        return reply.code(400).send({ error: e.message });
    }
};

export const updatePlatformUserStatus = async (req: any, reply: any) => {
    const { userId } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
        return reply.code(400).send({ error: 'Invalid status' });
    }

    try {
        const updated = await prisma.user.update({
            where: { id: userId },
            data: { status },
            select: {
                id: true,
                email: true,
                name: true,
                status: true
            }
        });
        return { success: true, user: updated };
    } catch (e: any) {
        return reply.code(404).send({ error: e.message });
    }
};

export const purgeDemoData = async (req: any, reply: any) => {
    // Only Super Admins can purge demo data
    if (req.user.role !== 'SUPER_ADMIN') {
        return reply.code(403).send({ error: 'Forbidden', message: 'Only Super Admins can perform this action.' });
    }

    try {
        // Delete all demo data from database (orders, events, logs)
        await Promise.all([
            prisma.canonicalOrder.deleteMany({}),
            prisma.ingestionEvent.deleteMany({}),
            prisma.kpiValue.deleteMany({})
        ]);
        
        return { success: true, message: 'Demo data purged successfully.' };
    } catch (e: any) {
        return reply.code(500).send({ error: 'Purge failed', message: e.message });
    }
};
=======
import { InMemoryRelationalAdapter } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { AuthService } from '../services/auth.service';

const db = new InMemoryRelationalAdapter();

export const listProjectCustomers = async (req: any, reply: any) => {
    const { projectId } = req.params;
    
    // Additional security for non-SuperAdmins
    if (req.user.role !== 'SUPER_ADMIN' && !req.user.assignedProjects.includes(projectId)) {
        return reply.code(403).send({ error: 'Forbidden', message: 'You do not have access to this project administration.' });
    }

    const customers = await db.getUsersByProject(projectId);
    
    // Scrub sensitive data
    const scrubbed = customers.map(c => {
        const { passwordHash, ...rest } = c;
        return rest;
    });

    return scrubbed;
};

export const createCustomer = async (req: any, reply: any) => {
    const { projectId } = req.params;
    const { email, name, password } = req.body;

    if (!email || !password || !name) {
        return reply.code(400).send({ error: 'Missing fields' });
    }

    // Security check
    if (req.user.role !== 'SUPER_ADMIN' && !req.user.assignedProjects.includes(projectId)) {
        return reply.code(403).send({ error: 'Forbidden' });
    }

    try {
        const passwordHash = await AuthService.hashPassword(password);
        const now = new Date().toISOString();
        
        const newUser = {
            id: `u_${Math.random().toString(36).slice(2, 7)}`,
            email,
            name,
            passwordHash,
            role: 'CUSTOMER',
            status: 'active',
            assignedProjects: [projectId],
            audit: {
                createdAt: now,
                updatedAt: now
            }
        };

        await db.createUser(newUser);
        
        const { passwordHash: _, ...userWithoutPass } = newUser;
        return reply.code(201).send(userWithoutPass);
    } catch (e: any) {
        return reply.code(400).send({ error: e.message });
    }
};

export const updateCustomerStatus = async (req: any, reply: any) => {
    const { userId } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
        return reply.code(400).send({ error: 'Invalid status' });
    }

    try {
        await db.updateUser(userId, { status });
        return { success: true };
    } catch (e: any) {
        return reply.code(404).send({ error: e.message });
    }
};
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
