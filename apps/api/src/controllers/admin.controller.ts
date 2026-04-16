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
