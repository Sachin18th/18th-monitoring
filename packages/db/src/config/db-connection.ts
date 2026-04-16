import { InMemoryTimeSeriesAdapter, InMemoryEventAdapter, InMemoryRelationalAdapter, GlobalMemoryStore } from '../adapters/in-memory.adapter';

export const DatabaseFactory = {
    getTimeSeriesDb: () => new InMemoryTimeSeriesAdapter(),
    getEventStoreDb: () => new InMemoryEventAdapter(),
    getRelationalDb: () => new InMemoryRelationalAdapter()
};

export { GlobalMemoryStore };
