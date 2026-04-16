import { AuthService } from '../services/auth.service';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';

export const login = async (req: any, reply: any) => {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    
    if (!result) {
        return reply.code(401).send({ error: 'Invalid credentials' });
    }
    
    return reply.code(200).send(result);
};

export const getMe = async (req: any, reply: any) => {
    return reply.code(200).send({ user: req.user });
};

export const getProjects = async (req: any, reply: any) => {
    const userRole = req.user.role;
    const assignedIds = req.user.assignedProjects;
    
    const allProjects = Array.from(GlobalMemoryStore.projects.values());
    
    if (userRole === 'SUPER_ADMIN') {
        return reply.code(200).send(allProjects);
    }
    
    const filtered = allProjects.filter(p => assignedIds.includes(p.id));
    return reply.code(200).send(filtered);
};
