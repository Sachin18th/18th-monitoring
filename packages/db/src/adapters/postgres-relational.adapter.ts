import prisma from '../prisma-client';

export const db = prisma;

/**
 * Legacy PostgresAdapter (Phase 1/2) - for backwards compatibility
 * with existing interfaces.
 */
export class PostgresAdapter {
    // Migrated from Drizzle ORM to Prisma
    async updateSiteConfig(siteId: string, config: any): Promise<void> {
        await prisma.project.updateMany({
            where: { id: siteId },
            data: {
                settings: config,
                updatedAt: new Date(),
            },
        });
    }
}
