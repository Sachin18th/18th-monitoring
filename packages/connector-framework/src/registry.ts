import { BaseConnector } from './base-connector';
import { ConnectorRegistryEntry } from '@kpi-platform/shared-types';

export class ConnectorRegistry {
    private static connectors = new Map<string, BaseConnector>();
    private static metadata = new Map<string, ConnectorRegistryEntry>();

    /**
     * Register a connector implementation.
     */
    public static register(entry: ConnectorRegistryEntry, implementation: BaseConnector) {
        this.connectors.set(entry.type, implementation);
        this.metadata.set(entry.type, entry);
        console.log(`[ConnectorRegistry] Registered: ${entry.type} v${entry.version}`);
    }

    /**
     * Get a connector implementation by type.
     */
    public static get(type: string): BaseConnector | undefined {
        return this.connectors.get(type);
    }

    /**
     * List all registered connector metadata.
     */
    public static list(): ConnectorRegistryEntry[] {
        return Array.from(this.metadata.values());
    }

    /**
     * Get metadata for a specific connector type.
     */
    public static getMetadata(type: string): ConnectorRegistryEntry | undefined {
        return this.metadata.get(type);
    }
}
