import type { PrismaClient } from '@prisma/client';
import { InMemoryEventAdapter, InMemoryTimeSeriesAdapter } from '../adapters/in-memory.adapter';
import prisma from '../prisma-client';

export { prisma };

export const db = prisma;

export function getDbConnection(): PrismaClient {
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
