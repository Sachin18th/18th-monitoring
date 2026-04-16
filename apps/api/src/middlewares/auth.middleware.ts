import { AuthService } from '../services/auth.service';

export const tenantAuthHandler = async (req: any, reply: any) => {
    // Standardize on Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];
    let token = req.headers['session-token']; // Legacy support

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }
    
    if (!token) {
        return reply.code(401).send({ error: 'Authentication required' });
    }

    const session = await AuthService.getSession(String(token));
    if (!session) {
        return reply.code(401).send({ error: 'Invalid or expired session' });
    }

    // Attach user to request
    req.user = session.user;
    
    // Validate siteId access if provided in query or used in dashboard routes
    const siteId = req.query.siteId || req.params.siteId;
    if (siteId) {
        const hasAccess = await AuthService.validateProjectAccess(req.user.id, siteId);
        if (!hasAccess) {
            return reply.code(403).send({ error: 'Unauthorized access to project' });
        }
        req.siteId = siteId;
    }
};
