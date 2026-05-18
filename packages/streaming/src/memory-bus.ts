import { EventEmitter } from 'events';

class AsyncEventBus extends EventEmitter {
    /**
     * Overrides emit to await all async listeners.
     * The standard EventEmitter.emit() is synchronous and ignores
     * returned Promises from async listeners — causing silent failures.
     */
    async emitAsync(event: string, ...args: any[]): Promise<void> {
        const listeners = this.rawListeners(event);
        for (const listener of listeners) {
            try {
                await (listener as Function)(...args);
            } catch (err) {
                console.error(`[MemoryBus] Uncaught error in listener for '${event}':`, err);
            }
        }
    }
}

export const MemoryBus = new AsyncEventBus();
