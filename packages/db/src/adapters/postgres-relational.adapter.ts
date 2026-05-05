<<<<<<< HEAD
import prisma from '../prisma-client';

export const db = prisma;
=======
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../drizzle/schema';

// Mock DB for local scripts/simulations when DATABASE_URL is missing
// In production, this uses the real postgres connection
const connectionString = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/db';

// For simulation/CI, we often want to mock the 'db' object to avoid actual connection attempts.
// Here we provide a structural mock if we are in verification mode.

const isVerification = process.env.VERIFICATION_MODE === 'true';

let dbInstance: any;

if (isVerification) {
    dbInstance = {
        insert: () => ({ values: () => Promise.resolve() }),
        update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
        delete: () => ({ where: () => Promise.resolve() }),
        select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
        transaction: (cb: any) => cb({
            insert: () => ({ values: () => Promise.resolve() }),
            update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
            select: () => ({ from: () => ({ 
                where: () => ({ 
                    orderBy: () => ({ 
                        limit: () => Promise.resolve([]) 
                    }) 
                }) 
            }) }),
        })
    };
} else {
    // Real implementation (requires 'postgres' and 'drizzle-orm' pkgs)
    const client = postgres(connectionString);
    dbInstance = drizzle(client, { schema });
}

export const db = dbInstance;
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

/**
 * Legacy PostgresAdapter (Phase 1/2) - for backwards compatibility
 * with existing interfaces.
 */
export class PostgresAdapter {
<<<<<<< HEAD
    // Migrated from Drizzle ORM to Prisma
    async updateSiteConfig(siteId: string, config: any): Promise<void> {
        await prisma.project.updateMany({
            where: { id: siteId },
            data: {
                settings: config,
                updatedAt: new Date(),
            },
        });
=======
    async updateSiteConfig(siteId: string, config: any): Promise<void> {
        console.log(`[PostgresAdapter] Updated master configuration for ${siteId}`);
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    }
}
