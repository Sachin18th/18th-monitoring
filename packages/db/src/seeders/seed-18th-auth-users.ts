import crypto from 'crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

/**
 * Seed script for 4 test users with correct scrypt hashing.
 * Uses the EXACT same hashing method as AuthService.login() to ensure compatibility.
 * 
 * Users:
 * - Super Admin: superadmin@18thdigitech.com
 * - Project Admin: projectadmin@18thdigitech.com  
 * - Ops Lead (OPERATOR): opslead@18thdigitech.com
 * - Analyst (VIEWER): analyst@18thdigitech.com
 * 
 * All passwords: Demo@1234!
 */
export async function seedAuthUsers(store: any): Promise<void> {
    console.log('[Seeder:Auth] Starting 18th Digitech auth user seeding...');
    
    // Hash function EXACTLY matching AuthService.hashPassword()
    async function hashPassword(password: string): Promise<string> {
        const salt = crypto.randomBytes(16).toString('hex');
        const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
        return `${salt}:${derivedKey.toString('hex')}`;
    }

    const users = [
        {
            id: 'user_18th_super',
            email: 'superadmin@18thdigitech.com',
            name: '18th Super Admin',
            role: 'SUPER_ADMIN',
            password: 'Demo@1234!'
        },
        {
            id: 'user_18th_project_admin',
            email: 'projectadmin@18thdigitech.com',
            name: '18th Project Admin',
            role: 'PROJECT_ADMIN',
            password: 'Demo@1234!'
        },
        {
            id: 'user_18th_ops_lead',
            email: 'opslead@18thdigitech.com',
            name: '18th Ops Lead',
            role: 'OPERATOR',
            password: 'Demo@1234!'
        },
        {
            id: 'user_18th_analyst',
            email: 'analyst@18thdigitech.com',
            name: '18th Analyst',
            role: 'VIEWER',
            password: 'Demo@1234!'
        }
    ];

    const tenantId = 'tenant_18th_digitech';
    const projectId = 'proj-18th-digitech';
    const now = new Date().toISOString();

    // Ensure tenant exists
    if (!store.tenants.has(tenantId)) {
        store.tenants.set(tenantId, {
            id: tenantId,
            name: '18th Digitech Enterprise',
            slug: '18th-digitech-enterprise',
            status: 'ACTIVE',
            plan: 'ENTERPRISE',
            createdAt: now,
            updatedAt: now
        });
        console.log('[Seeder:Auth] ✓ Tenant created');
    }

    // Ensure project exists
    if (!store.projects.has(projectId)) {
        store.projects.set(projectId, {
            id: projectId,
            tenantId: tenantId,
            name: '18th Digitech Creation',
            environment: 'production',
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now
        });
        console.log('[Seeder:Auth] ✓ Project created');
    }

    // Seed users (idempotent)
    let created = 0;
    for (const user of users) {
        // Check if user already exists by email
        const existing = store.users.get(user.email) || 
                        Array.from(store.users.values()).find((u: any) => u.email === user.email);
        
        if (existing) {
            console.log(`[Seeder:Auth] ⊘ ${user.email} already exists (skipped)`);
            continue;
        }

        const passwordHash = await hashPassword(user.password);
        
        store.users.set(user.email, {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            passwordHash: passwordHash,
            status: 'active',  // ⚠️ CRITICAL: Must be lowercase 'active'
            tenantId: tenantId,
            assignedProjects: [projectId],
            mfaEnabled: 0,
            lastLoginAt: null,
            createdAt: now,
            updatedAt: now,
            audit: {
                createdAt: now,
                updatedAt: now,
                failedLogins: 0
            },
            metadata: { source: 'seed-18th-auth' }
        });
        
        console.log(`[Seeder:Auth] ✓ Created ${user.role.padEnd(13)} → ${user.email}`);
        created++;
    }

    console.log(`[Seeder:Auth] Complete. ${created} new user(s) created.`);
}

// Standalone execution support (for npm scripts)
if (require.main === module) {
    (async () => {
        try {
            // Import GlobalMemoryStore only when executed directly
            const { GlobalMemoryStore } = require('../adapters/in-memory.adapter');
            await seedAuthUsers(GlobalMemoryStore);
            console.log('[Seeder:Auth] ✅ Seeding complete — restart API server to apply.');
            process.exit(0);
        } catch (err) {
            console.error('[Seeder:Auth] ❌ Error:', err);
            process.exit(1);
        }
    })();
}
