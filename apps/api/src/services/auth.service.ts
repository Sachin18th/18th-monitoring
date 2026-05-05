<<<<<<< HEAD

// import { prisma } from '@kpi-platform/db';
// import crypto from 'crypto';
// import { promisify } from 'node:util';
// import { AuditService } from './audit.service';

// const scrypt = promisify(crypto.scrypt);

// // Helper to check if user status is active
// function isActiveStatus(status: string | null | undefined): boolean {
//     return String(status ?? '').toUpperCase() === 'ACTIVE';
// }

// // Helper to load assigned projects for a user
// async function getAssignedProjects(userId: string): Promise<string[]> {
//     const access = await prisma.userProjectAccess.findMany({
//         where: { userId },
//         select: { projectId: true }
//     });
//     return access.map(a => a.projectId);
// }

// export class AuthService {
//     // Secure hashing using native scrypt
//     static async hashPassword(password: string): Promise<string> {
//         const salt = crypto.randomBytes(16).toString('hex');
//         const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
//         return `${salt}:${derivedKey.toString('hex')}`;
//     }

//     static async comparePassword(password: string, hash: string): Promise<boolean> {
//         const [salt, key] = hash.split(':');
//         if (!salt || !key) {
//             return false;
//         }
//         const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
//         return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
//     }

//     static async login(email: string, password: string): Promise<{ token: string, user: any } | null> {
//         // Query user from database by email
//         const user = await prisma.user.findUnique({
//             where: { email },
//             select: {
//                 id: true,
//                 email: true,
//                 name: true,
//                 role: true,
//                 status: true,
//                 tenantId: true,
//                 passwordHash: true,
//                 lastLoginAt: true
//             }
//         });
        
//         if (!user || !isActiveStatus(user.status)) {
//             await AuditService.log({ action: 'LOGIN_ATTEMPT', actorId: email, status: 'FAILURE', metadata: { reason: 'User not found or inactive' }});
//             return null;
//         }

//         // TODO (PROD): Implement Brute Force Protection (Lockout)
//         // Check if failed logins > 5 within lockout window.

//         const isMatch = await this.comparePassword(password, user.passwordHash);
//         if (!isMatch) {
//             await AuditService.log({ action: 'LOGIN_ATTEMPT', actorId: email, status: 'FAILURE', metadata: { reason: 'Invalid credentials' }});
//             return null;
//         }

//         // Update last login timestamp
//         const now = new Date();
//         const updatedUser = await prisma.user.update({
//             where: { id: user.id },
//             data: { lastLoginAt: now },
//             select: {
//                 id: true,
//                 email: true,
//                 name: true,
//                 role: true,
//                 tenantId: true,
//                 lastLoginAt: true
//             }
//         });

//         // Get assigned projects
//         const assignedProjects = await getAssignedProjects(updatedUser.id);

//         // Generate token and create session in database
//         const token = crypto.randomBytes(32).toString('hex');
//         const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

//         await prisma.userSession.create({
//             data: {
//                 token,
//                 userId: updatedUser.id,
//                 expiresAt,
//                 metadata: {
//                     email: updatedUser.email,
//                     role: updatedUser.role,
//                     tenantId: updatedUser.tenantId
//                 }
//             }
//         });

//         // Build response user object (exclude passwordHash)
//         const responseUser = {
//             id: updatedUser.id,
//             email: updatedUser.email,
//             name: updatedUser.name,
//             role: updatedUser.role,
//             tenantId: updatedUser.tenantId,
//             assignedProjects,
//             lastLoginAt: updatedUser.lastLoginAt?.toISOString() || null,
//             audit: {
//                 lastLoginAt: updatedUser.lastLoginAt?.toISOString() || null,
//                 failedLogins: 0,
//                 lockoutUntil: null
//             }
//         };

//         await AuditService.log({ action: 'LOGIN_SUCCESS', actorId: email, actorRole: user.role, status: 'SUCCESS' });
//         return { token, user: responseUser };
//     }

//     static async getSession(token: string) {
//         // Query session from database
//         const session = await prisma.userSession.findUnique({
//             where: { token }
//         });
        
//         if (!session) return null;

//         // Check if session has expired
//         if (session.expiresAt.getTime() < Date.now()) {
//             await prisma.userSession.delete({ where: { token } }).catch(() => undefined);
//             return null;
//         }

//         // Load user associated with session
//         const user = await prisma.user.findUnique({
//             where: { id: session.userId },
//             select: {
//                 id: true,
//                 email: true,
//                 name: true,
//                 role: true,
//                 status: true,
//                 tenantId: true,
//                 lastLoginAt: true
//             }
//         });

//         if (!user || !isActiveStatus(user.status)) {
//             await prisma.userSession.delete({ where: { token } }).catch(() => undefined);
//             return null;
//         }

//         // Load assigned projects
//         const assignedProjects = await getAssignedProjects(user.id);

//         // Build session object with user data
//         const responseUser = {
//             id: user.id,
//             email: user.email,
//             name: user.name,
//             role: user.role,
//             status: user.status,
//             tenantId: user.tenantId,
//             assignedProjects,
//             lastLoginAt: user.lastLoginAt?.toISOString() || null,
//             audit: {
//                 lastLoginAt: user.lastLoginAt?.toISOString() || null,
//                 failedLogins: 0,
//                 lockoutUntil: null
//             }
//         };

//         return {
//             token: session.token,
//             user: responseUser,
//             expiresAt: session.expiresAt.toISOString()
//         };
//     }

//     static async validateProjectAccess(userId: string, siteId: string): Promise<boolean> {
//         // Query user from database
//         const user = await prisma.user.findUnique({
//             where: { id: userId },
//             select: { id: true, role: true, status: true }
//         });

//         if (!user || !isActiveStatus(user.status)) {
//             return false;
//         }
        
//         // SUPER_ADMIN has access to all projects
//         if (user.role === 'SUPER_ADMIN') {
//             return true;
//         }
        
//         // Check if user has access to this specific project
//         const access = await prisma.userProjectAccess.findFirst({
//             where: { userId, projectId: siteId }
//         });

//         if (!access) {
//             await AuditService.log({ action: 'PROJECT_ACCESS_DENIED', actorId: userId, targetId: siteId, status: 'FAILURE' });
//             return false;
//         }

//         return true;
//     }

//     static async logout(token: string) {
//         await prisma.userSession.delete({ where: { token } }).catch(() => undefined);
//         return true;
//     }
// }


import { prisma } from '@kpi-platform/db';
=======
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
import crypto from 'crypto';
import { promisify } from 'node:util';
import { AuditService } from './audit.service';

const scrypt = promisify(crypto.scrypt);

<<<<<<< HEAD
// Helper to check if user status is active
function isActiveStatus(status: string | null | undefined): boolean {
    return String(status ?? '').toUpperCase() === 'ACTIVE';
}

// Helper to load assigned projects for a user
async function getAssignedProjects(userId: string): Promise<string[]> {
    const access = await prisma.userProjectAccess.findMany({
        where: { userId },
        select: { projectId: true }
    });
    return access.map(a => a.projectId);
}

=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
export class AuthService {
    // Secure hashing using native scrypt
    static async hashPassword(password: string): Promise<string> {
        const salt = crypto.randomBytes(16).toString('hex');
        const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
        return `${salt}:${derivedKey.toString('hex')}`;
    }

    static async comparePassword(password: string, hash: string): Promise<boolean> {
        const [salt, key] = hash.split(':');
<<<<<<< HEAD
        if (!salt || !key) {
            return false;
        }
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
        const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
        return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
    }

    static async login(email: string, password: string): Promise<{ token: string, user: any } | null> {
<<<<<<< HEAD
        // Query user from database by email
        let user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true,
                tenantId: true,
                passwordHash: true,
                lastLoginAt: true
            }
        });
        
        // Bootstrap: Create superadmin if it doesn't exist and matches known demo account
        if (!user && email === 'superadmin@18thdigitech.com' && password === 'Demo@1234!') {
            try {
                const defaultTenantId = 'tenant_18th_digitech';
                
                // Ensure tenant exists first
                const tenant = await prisma.tenant.findUnique({
                    where: { id: defaultTenantId }
                }).catch(() => null);
                
                if (!tenant) {
                    await prisma.tenant.create({
                        data: {
                            id: defaultTenantId,
                            name: '18th Digitech',
                            slug: 'digitech-18',
                            status: 'ACTIVE'
                        }
                    });
                }
                
                // Create the superadmin user
                const passwordHash = await this.hashPassword(password);
                user = await prisma.user.create({
                    data: {
                        id: crypto.randomUUID(),
                        email,
                        name: '18th Super Admin',
                        tenantId: defaultTenantId,
                        role: 'SUPER_ADMIN',
                        status: 'ACTIVE',
                        passwordHash
                    },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        role: true,
                        status: true,
                        tenantId: true,
                        passwordHash: true,
                        lastLoginAt: true
                    }
                });
                
                console.log('[AUTH] Bootstrap created superadmin user:', email);
            } catch (err) {
                console.error('[AUTH] Bootstrap failed:', err);
            }
        }
        
        if (!user || !isActiveStatus(user.status)) {
            await AuditService.log({ action: 'LOGIN_ATTEMPT', actorId: email, tenantId: user?.tenantId, status: 'FAILURE', metadata: { reason: 'User not found or inactive' }});
=======
        const user = GlobalMemoryStore.users.get(email);
        
        if (!user || user.status !== 'active') {
            await AuditService.log({ action: 'LOGIN_ATTEMPT', actorId: email, status: 'FAILURE', metadata: { reason: 'User not found or inactive' }});
            // TODO (PROD): Delay response to prevent timing attacks uncovering valid emails
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
            return null;
        }

        // TODO (PROD): Implement Brute Force Protection (Lockout)
<<<<<<< HEAD
        // Check if failed logins > 5 within lockout window.

        const isMatch = await this.comparePassword(password, user.passwordHash);
        if (!isMatch) {
            await AuditService.log({ action: 'LOGIN_ATTEMPT', actorId: email, tenantId: user.tenantId, status: 'FAILURE', metadata: { reason: 'Invalid credentials' }});
            return null;
        }

        // Update last login timestamp
        const now = new Date();
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: now },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                tenantId: true,
                lastLoginAt: true
            }
        });

        // Get assigned projects
        const assignedProjects = await getAssignedProjects(updatedUser.id);

        // Generate token and create session in database
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

        await prisma.userSession.create({
            data: {
                token,
                userId: updatedUser.id,
                expiresAt,
                metadata: {
                    email: updatedUser.email,
                    role: updatedUser.role,
                    tenantId: updatedUser.tenantId
                }
            }
        });

        // Build response user object (exclude passwordHash)
        const responseUser = {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            role: updatedUser.role,
            tenantId: updatedUser.tenantId,
            assignedProjects,
            lastLoginAt: updatedUser.lastLoginAt?.toISOString() || null,
            audit: {
                lastLoginAt: updatedUser.lastLoginAt?.toISOString() || null,
                failedLogins: 0,
                lockoutUntil: null
            }
        };

        await AuditService.log({ action: 'LOGIN_SUCCESS', actorId: email, tenantId: user.tenantId, actorRole: user.role, status: 'SUCCESS' });
        return { token, user: responseUser };
    }

    static async getSession(token: string) {
        // Query session from database
        const session = await prisma.userSession.findUnique({
            where: { token }
        });
        
        if (!session) return null;

        // Check if session has expired
        if (session.expiresAt.getTime() < Date.now()) {
            await prisma.userSession.delete({ where: { token } }).catch(() => undefined);
            return null;
        }

        // Load user associated with session
        const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                status: true,
                tenantId: true,
                lastLoginAt: true
            }
        });

        if (!user || !isActiveStatus(user.status)) {
            await prisma.userSession.delete({ where: { token } }).catch(() => undefined);
            return null;
        }

        // Load assigned projects
        const assignedProjects = await getAssignedProjects(user.id);

        // Build session object with user data
        const responseUser = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
            tenantId: user.tenantId,
            assignedProjects,
            lastLoginAt: user.lastLoginAt?.toISOString() || null,
            audit: {
                lastLoginAt: user.lastLoginAt?.toISOString() || null,
                failedLogins: 0,
                lockoutUntil: null
            }
        };

        return {
            token: session.token,
            user: responseUser,
            expiresAt: session.expiresAt.toISOString()
        };
    }

    static async validateProjectAccess(userId: string, siteId: string): Promise<boolean> {
        // Query user from database
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true, status: true, tenantId: true }
        });

        if (!user || !isActiveStatus(user.status)) {
            return false;
        }
        
        // SUPER_ADMIN has access to all projects
        if (user.role === 'SUPER_ADMIN') {
            return true;
        }
        
        // Check if user has access to this specific project
        const access = await prisma.userProjectAccess.findFirst({
            where: { userId, projectId: siteId }
        });

        if (!access) {
            await AuditService.log({ action: 'PROJECT_ACCESS_DENIED', actorId: userId, tenantId: user.tenantId, targetId: siteId, status: 'FAILURE' });
            return false;
        }

        return true;
    }

    static async logout(token: string) {
        await prisma.userSession.delete({ where: { token } }).catch(() => undefined);
        return true;
    }
}
=======
        // Check if `user.audit.failedLogins` > 5 within `user.audit.lockoutUntil`.
        // If so, return null / throw error.

        const isMatch = await this.comparePassword(password, user.passwordHash);
        if (!isMatch) {
            await AuditService.log({ action: 'LOGIN_ATTEMPT', actorId: email, status: 'FAILURE', metadata: { reason: 'Invalid credentials' }});
            // TODO (PROD): Increment `user.audit.failedLogins`. Lock account if >5.
            return null;
        }

        // Reset failed logins on successful login
        // user.audit.failedLogins = 0;

        // Update last login
        user.audit.lastLoginAt = new Date().toISOString();

        // Mock token generation
        const token = crypto.randomBytes(16).toString('hex');
        const session = {
            token,
            user: { ...user },
            expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
        };
        
        // Exclude security fields from leaked user object
        delete session.user.passwordHash;
        
        GlobalMemoryStore.sessions.set(token, session);

        await AuditService.log({ action: 'LOGIN_SUCCESS', actorId: email, actorRole: user.role, status: 'SUCCESS' });
        return { token, user: session.user };
    }

    static async getSession(token: string) {
        const session = GlobalMemoryStore.sessions.get(token);
        if (!session) return null;

        // Session Expiry Enforcement
        if (new Date(session.expiresAt).getTime() < Date.now()) {
            GlobalMemoryStore.sessions.delete(token); // Auto-purge expired session
            return null;
        }

        // TODO (PROD): Implement Sliding Session (refresh expiry) if needed
        return session;
    }

    static async validateProjectAccess(userId: string, siteId: string): Promise<boolean> {
        const user = Array.from(GlobalMemoryStore.users.values()).find(u => u.id === userId);
        if (!user) return false;
        
        if (user.role === 'SUPER_ADMIN') return true;
        
        const hasAccess = user.assignedProjects.includes(siteId);
        if (!hasAccess) {
             await AuditService.log({ action: 'PROJECT_ACCESS_DENIED', actorId: userId, targetId: siteId, status: 'FAILURE' });
        }
        return hasAccess;
    }

    static async logout(token: string) {
        GlobalMemoryStore.sessions.delete(token);
        return true;
    }
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
