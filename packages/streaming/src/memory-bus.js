"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryBus = void 0;
const events_1 = require("events");
class AsyncEventBus extends events_1.EventEmitter {
    /**
     * Overrides emit to await all async listeners.
     * The standard EventEmitter.emit() is synchronous and ignores
     * returned Promises from async listeners — causing silent failures.
     */
    async emitAsync(event, ...args) {
        const listeners = this.rawListeners(event);
        for (const listener of listeners) {
            try {
                await listener(...args);
            }
            catch (err) {
                console.error(`[MemoryBus] Uncaught error in listener for '${event}':`, err);
            }
        }
    }
}
exports.MemoryBus = new AsyncEventBus();
