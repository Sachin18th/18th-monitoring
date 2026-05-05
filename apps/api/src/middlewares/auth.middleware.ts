import { AuthService } from '../services/auth.service';
<<<<<<< HEAD
import { errorResponse } from '../utils/response';
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

export const tenantAuthHandler = async (req: any, reply: any) => {
    // Standardize on Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];
    let token = req.headers['session-token']; // Legacy support

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }
    
    if (!token) {
<<<<<<< HEAD
        return reply.code(401).send(errorResponse('Authentication required', 'UNAUTHORIZED'));
=======
        return reply.code(401).send({ error: 'Authentication required' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }

    const session = await AuthService.getSession(String(token));
    if (!session) {
<<<<<<< HEAD
        return reply.code(401).send(errorResponse('Invalid or expired session', 'SESSION_EXPIRED'));
=======
        return reply.code(401).send({ error: 'Invalid or expired session' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }

    // Attach user to request
    req.user = session.user;
<<<<<<< HEAD
    req.tenantId = session.user.tenantId; // Ensure tenant context is always available
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    
    // Validate siteId access if provided in query or used in dashboard routes
    const siteId = req.query.siteId || req.params.siteId;
    if (siteId) {
        const hasAccess = await AuthService.validateProjectAccess(req.user.id, siteId);
        if (!hasAccess) {
<<<<<<< HEAD
            return reply.code(403).send(errorResponse(`Unauthorized access to project ${siteId}`, 'FORBIDDEN'));
=======
            return reply.code(403).send({ error: 'Unauthorized access to project' });
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        }
        req.siteId = siteId;
    }
};
