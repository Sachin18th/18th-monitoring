import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import crypto from 'crypto';
import { promisify } from 'node:util';
import { AuditService } from './audit.service';

const scrypt = promisify(crypto.scrypt);

export class AuthService {
    // Secure hashing using native scrypt
    static async hashPassword(password: string): Promise<string> {
        const salt = crypto.randomBytes(16).toString('hex');
        const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
        return `${salt}:${derivedKey.toString('hex')}`;
    }

    static async comparePassword(password: string, hash: string): Promise<boolean> {
        const [salt, key] = hash.split(':');
        const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
        return crypto.timingSafeEqual(Buffer.from(key, 'hex'), derivedKey);
    }

    static async login(email: string, password: string): Promise<{ token: string, user: any } | null> {
        const user = GlobalMemoryStore.users.get(email);
        
        if (!user || user.status !== 'active') {
            await AuditService.log({ action: 'LOGIN_ATTEMPT', actorId: email, status: 'FAILURE', metadata: { reason: 'User not found or inactive' }});
            // TODO (PROD): Delay response to prevent timing attacks uncovering valid emails
            return null;
        }

        // TODO (PROD): Implement Brute Force Protection (Lockout)
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
