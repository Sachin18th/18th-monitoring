import { InMemoryEventAdapter, InMemoryTimeSeriesAdapter } from '../adapters/in-memory.adapter';
import prisma from '../prisma-client';

export { prisma };

export const db = prisma;

// The exported client is wrapped with a $extends() PII guard, so its type is the
// extended client rather than the bare PrismaClient. Derive the return type from
// the instance to keep them in sync.
export function getDbConnection(): typeof prisma {
    return prisma;
}

export async function closeDbConnection(): Promise<void> {
    await prisma.$disconnect();
}

export const DatabaseFactory = {
    getTimeSeriesDb: () => new InMemoryTimeSeriesAdapter(),
    getEventStoreDb: () => new InMemoryEventAdapter(),
    getRelationalDb: () => prisma,
};