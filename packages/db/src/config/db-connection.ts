<<<<<<< HEAD
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
=======
import { InMemoryTimeSeriesAdapter, InMemoryEventAdapter, InMemoryRelationalAdapter, GlobalMemoryStore } from '../adapters/in-memory.adapter';
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

export const DatabaseFactory = {
    getTimeSeriesDb: () => new InMemoryTimeSeriesAdapter(),
    getEventStoreDb: () => new InMemoryEventAdapter(),
<<<<<<< HEAD
    getRelationalDb: () => prisma,
};
=======
    getRelationalDb: () => new InMemoryRelationalAdapter()
};

export { GlobalMemoryStore };
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
