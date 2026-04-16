import { transportLayer } from '../transport/sender';
import { configHandler } from '../core/config';

export const eventBuffer = {
    queue: [] as any[],
    batchSize: 10,
    flushTimer: null as any,
    flushTimeoutMs: 5000,

    addEvent(event: any) {
        this.queue.push(event);

        if (this.queue.length >= this.batchSize) {
            this.flush();
        } else if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flush(), this.flushTimeoutMs);
        }
    },

    async flush() {
        if (this.queue.length === 0) return;
        
        clearTimeout(this.flushTimer);
        this.flushTimer = null;

        const payload = {
            siteId: configHandler.state.siteId,
            events: [...this.queue] // Cloned array mapping out race state conditions
        };
        this.queue = [];

        // TODO: Apply LZ-String mappings (GZIP bindings shrinking payloads)
        await transportLayer.sendBatch(payload);
    }
};
