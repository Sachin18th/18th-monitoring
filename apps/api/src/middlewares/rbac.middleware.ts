import { Role } from '../../../../packages/shared-types/src';

/**
 * Ensures user has one of the required roles
 */
export const roleGuard = (allowedRoles: Role[]) => {
    return async (req: any, reply: any) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return reply.code(403).send({ 
                error: 'Forbidden', 
                message: `This action requires ${allowedRoles.join(' or ')} permissions.` 
            });
        }
    };
};

/**
 * Strictly prevents CUSTOMER from non-safe methods (POST, PUT, PATCH, DELETE)
 */
export const viewOnlyGuard = async (req: any, reply: any) => {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    
    if (req.user?.role === 'CUSTOMER' && !safeMethods.includes(req.method)) {
        return reply.code(403).send({ 
            error: 'Forbidden', 
            message: 'Your account is view-only. You cannot perform this action.' 
        });
    }
};
