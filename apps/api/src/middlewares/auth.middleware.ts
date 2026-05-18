import { AuthService } from '../services/auth.service';
import { errorResponse } from '../utils/response';

export const tenantAuthHandler = async (req: any, reply: any) => {
    // Standardize on Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];
    let token = req.headers['session-token']; // Legacy support

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }
    
    if (!token) {
        return reply.code(401).send(errorResponse('Authentication required', 'UNAUTHORIZED'));
    }

    const session = await AuthService.getSession(String(token));
    if (!session) {
        return reply.code(401).send(errorResponse('Invalid or expired session', 'SESSION_EXPIRED'));
    }

    // Attach user to request
    req.user = session.user;
    req.tenantId = session.user.tenantId; // Ensure tenant context is always available
    
    // Validate siteId access if provided in query or used in dashboard routes
    const siteId = req.query.siteId || req.params.siteId;
    if (siteId) {
        const hasAccess = await AuthService.validateProjectAccess(req.user.id, siteId);
        if (!hasAccess) {
            return reply.code(403).send(errorResponse(`Unauthorized access to project ${siteId}`, 'FORBIDDEN'));
        }
        req.siteId = siteId;
    }
};
