import crypto from 'crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import prisma from '../prisma-client';

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    return `${salt}:${derivedKey.toString('hex')}`;
}

export async function seedAuthUsersPrisma(): Promise<void> {
    console.log('[Seeder:Auth][Prisma] Starting 18th Digitech auth user seeding...');

    // Load .env from common locations if present
    const tryPaths = [
        path.resolve(__dirname, '../../.env'), // packages/db/.env
        path.resolve(__dirname, '../../../../.env'), // repo root .env
        path.resolve(__dirname, '../../../../apps/api/.env') // apps/api/.env
    ];

    for (const p of tryPaths) {
        if (fs.existsSync(p)) {
            dotenv.config({ path: p });
            console.log(`[Seeder:Auth][Prisma] Loaded env from ${p}`);
            break;
        }
    }

    if (!process.env.DATABASE_URL) {
        console.error('[Seeder:Auth][Prisma] ❌ DATABASE_URL is not set. Set it in your environment or in a .env file.');
        console.error('Tried paths:', tryPaths.join(', '));
        process.exit(1);
    }

    const tenantId = 'tenant_18th_digitech';
    const projectId = 'proj-18th-digitech';
    const now = new Date();

    // ensure tenant & project exist (upsert)
    await prisma.tenant.upsert({
        where: { id: tenantId },
        update: {
            name: '18th Digitech Enterprise',
            slug: '18th-digitech-enterprise',
            status: 'ACTIVE',
            plan: 'ENTERPRISE',
            updatedAt: now
        },
        create: {
            id: tenantId,
            name: '18th Digitech Enterprise',
            slug: '18th-digitech-enterprise',
            status: 'ACTIVE',
            plan: 'ENTERPRISE',
            createdAt: now,
            updatedAt: now
        }
    });

    await prisma.project.upsert({
        where: { id: projectId },
        update: {
            name: '18th Digitech Creation',
            slug: '18th-digitech-creation',
            environment: 'production',
            status: 'ACTIVE',
            updatedAt: now
        },
        create: {
            id: projectId,
            tenantId,
            name: '18th Digitech Creation',
            slug: '18th-digitech-creation',
            environment: 'production',
            status: 'ACTIVE',
            createdAt: now,
            updatedAt: now
        }
    });

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

    let created = 0;

    for (const u of users) {
        const pwHash = await hashPassword(u.password);

        // Upsert by unique email
        try {
            await prisma.user.upsert({
                where: { email: u.email },
                update: {
                    name: u.name,
                    role: u.role,
                    status: 'ACTIVE',
                    passwordHash: pwHash,
                    updatedAt: now
                },
                create: {
                    id: u.id,
                    tenantId,
                    email: u.email,
                    name: u.name,
                    passwordHash: pwHash,
                    role: u.role,
                    status: 'ACTIVE',
                    createdAt: now,
                    updatedAt: now
                }
            });

            // Ensure project access mapping exists; create if not present
            try {
                await prisma.userProjectAccess.create({
                    data: {
                        userId: u.id,
                        projectId: projectId,
                        roleOverride: null,
                        assignedAt: now
                    }
                });
            } catch (e: any) {
                // likely exists, ignore
            }

            console.log(`[Seeder:Auth][Prisma] ✓ Upserted ${u.role.padEnd(13)} → ${u.email}`);
            created++;
        } catch (err: any) {
            console.error('[Seeder:Auth][Prisma] ❌ Error upserting user', u.email, err.message || err);
        }
    }

    console.log(`[Seeder:Auth][Prisma] Complete. ${created} user upsert attempts (create/update).`);
}

// Standalone runner
if (require.main === module) {
    (async () => {
        try {
            await seedAuthUsersPrisma();
            console.log('[Seeder:Auth][Prisma] ✅ Seeding complete — verify in your KPI DB.');
            await prisma.$disconnect();
            process.exit(0);
        } catch (err) {
            console.error('[Seeder:Auth][Prisma] ❌ Error:', err);
            await prisma.$disconnect();
            process.exit(1);
        }
    })();
}
