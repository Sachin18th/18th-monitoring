"use strict";
/**
 * TTL-aware in-process LRU cache.
 *
 * Interface is Redis-compatible: get / set / del / flush.
 * To upgrade to Redis, swap the implementation behind this same interface —
 * all callers remain unchanged.
 *
 * Usage:
 *   import { cache } from '@kpi-platform/cache';
 *   await cache.set('resolved:store_001', payload, 300); // 300s TTL
 *   const hit = await cache.get<ProjectConfigPayload>('resolved:store_001');
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTL = exports.cache = void 0;
class TtlCache {
    store = new Map();
    maxSize;
    stats = { hits: 0, misses: 0 };
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        // Periodic eviction sweep every 60 seconds
        setInterval(() => this.sweep(), 60_000).unref();
    }
    async get(key) {
        const entry = this.store.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        if (Date.now() > entry.expiresAt) {
            this.stats.misses++;
            this.store.delete(key);
            return null;
        }
        this.stats.hits++;
        return entry.value;
    }
    async set(key, value, ttlSeconds) {
        if (this.store.size >= this.maxSize) {
            // Evict the oldest entry (first inserted — Map preserves insertion order)
            const firstKey = this.store.keys().next().value;
            if (firstKey !== undefined)
                this.store.delete(firstKey);
        }
        this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    }
    async del(key) {
        this.store.delete(key);
    }
    /** Invalidate all keys matching a prefix pattern — e.g. flush('resolved:') */
    async flush(prefix) {
        if (!prefix) {
            this.store.clear();
            return;
        }
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix))
                this.store.delete(key);
        }
    }
    sweep() {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (now > entry.expiresAt)
                this.store.delete(key);
        }
    }
    get size() { return this.store.size; }
    getTelemetry() {
        const total = this.stats.hits + this.stats.misses;
        return {
            size: this.store.size,
            maxSize: this.maxSize,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRatio: total > 0 ? (this.stats.hits / total).toFixed(4) : '0.0000'
        };
    }
}
// Singleton instance — shared across all services in the process
exports.cache = new TtlCache(parseInt(process.env.CACHE_MAX_ENTRIES || '2000'));
// Recommended TTL constants (seconds) — centralised so callers never hardcode
exports.TTL = {
    RESOLVED_CONFIG: parseInt(process.env.TTL_RESOLVED_CONFIG || '300'), // 5 min
    METRIC_CATALOG: parseInt(process.env.TTL_METRIC_CATALOG || '600'), // 10 min
    KPI_QUERY: parseInt(process.env.TTL_KPI_QUERY || '30'), // 30 sec
    WIDGET: parseInt(process.env.TTL_WIDGET || '60'), // 60 sec
    INTEGRATION_STATUS: parseInt(process.env.TTL_INTEGRATION_STATUS || '15'), // 15 sec
};
