"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalMemoryStore = exports.DatabaseFactory = void 0;
const in_memory_adapter_1 = require("../adapters/in-memory.adapter");
Object.defineProperty(exports, "GlobalMemoryStore", { enumerable: true, get: function () { return in_memory_adapter_1.GlobalMemoryStore; } });
exports.DatabaseFactory = {
    getTimeSeriesDb: () => new in_memory_adapter_1.InMemoryTimeSeriesAdapter(),
    getEventStoreDb: () => new in_memory_adapter_1.InMemoryEventAdapter(),
    getRelationalDb: () => new in_memory_adapter_1.InMemoryRelationalAdapter()
};
