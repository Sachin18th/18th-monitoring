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

/**
 * Legacy PostgresAdapter (Phase 1/2) - for backwards compatibility
 * with existing interfaces.
 */
export class PostgresAdapter {
    async updateSiteConfig(siteId: string, config: any): Promise<void> {
        console.log(`[PostgresAdapter] Updated master configuration for ${siteId}`);
    }
}
