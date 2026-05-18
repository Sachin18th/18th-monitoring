import { 
    IntegrationSyncType, 
    ConnectorLifecycleState, 
    ConnectorInstanceMetadata 
} from '@kpi-platform/shared-types';

export interface SyncResult {
    recordsProcessed: number;
    recordsFailed: number;
    checkpoint?: any;
    warnings?: string[];
    error?: string;
}

export interface ValidationResult {
    success: boolean;
    message?: string;
    missingScopes?: string[];
    reAuthRequired?: boolean;
}

export interface DiscoveryResult {
    accounts: any[];
    entities: string[];
    metadata: Record<string, any>;
}

/**
 * Base abstract class for all connectors.
 * Enforces the formal lifecycle contract defined in Phase 3.
 */
export abstract class BaseConnector {
    public abstract readonly type: string;
    public abstract readonly version: string;

    /**
     * Test reachability and authorization.
     */
    public abstract validateCredentials(config: any, credentials: any): Promise<ValidationResult>;

    /**
     * Discover available assets (accounts, stores, etc.) at the source.
     */
    public abstract discoverEntities(config: any, credentials: any): Promise<DiscoveryResult>;

    /**
     * Core synchronization logic.
     */
    public abstract sync(
        type: IntegrationSyncType,
        config: any,
        credentials: any,
        checkpoint?: any
    ): Promise<SyncResult>;

    /**
     * Webhook intake logic.
     */
    public async handleWebhook(payload: any, headers: any, config: any): Promise<void> {
        throw new Error('Webhooks not supported by this connector');
    }

    /**
     * Health check probe.
     */
    public abstract healthCheck(config: any, credentials: any): Promise<boolean>;

    /**
     * Map raw source data to the platform's canonical data model (CDM).
     */
    public abstract mapToCanonical(raw: any, entityType: string): any;

    /**
     * Validates that an inbound webhook actually came from the expected source.
     */
    public async validateWebhookSignature(payload: any, headers: any, config: any): Promise<boolean> {
        // Default implementation: assume valid if not explicitly checked
        return true;
    }

    /**
     * Retrieves the transformation mapping template for a given entity type for this connector.
     */
    public getMappingTemplate(entityType: string): any {
        return null;
    }
}
