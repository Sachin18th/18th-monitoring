"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectorRegistry = void 0;
class ConnectorRegistry {
    static connectors = new Map();
    static metadata = new Map();
    /**
     * Register a connector implementation.
     */
    static register(entry, implementation) {
        this.connectors.set(entry.type, implementation);
        this.metadata.set(entry.type, entry);
        console.log(`[ConnectorRegistry] Registered: ${entry.type} v${entry.version}`);
    }
    /**
     * Get a connector implementation by type.
     */
    static get(type) {
        return this.connectors.get(type);
    }
    /**
     * List all registered connector metadata.
     */
    static list() {
        return Array.from(this.metadata.values());
    }
    /**
     * Get metadata for a specific connector type.
     */
    static getMetadata(type) {
        return this.metadata.get(type);
    }
}
exports.ConnectorRegistry = ConnectorRegistry;
