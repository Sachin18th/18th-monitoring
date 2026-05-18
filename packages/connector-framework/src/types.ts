export enum ConnectorLifecycleState {
    IDLE = 'IDLE',
    CONNECTING = 'CONNECTING',
    VALIDATING = 'VALIDATING',
    DISCOVERING = 'DISCOVERING',
    SYNCING = 'SYNCING',
    RECONCILING = 'RECONCILING',
    ERROR = 'ERROR'
}

export enum ConnectorHealthStatus {
    HEALTHY = 'HEALTHY',
    DEGRADED = 'DEGRADED',
    FAILED = 'FAILED',
    OFFLINE = 'OFFLINE'
}

export interface ConnectorAuthConfig {
    type: 'OAUTH2' | 'API_KEY' | 'BASIC' | 'TOKEN';
    credentials: Record<string, any>; // Usually encrypted at rest
}

export interface ConnectorSyncConfig {
    frequency: 'MANUAL' | 'CRON';
    cronExpression?: string;
    backfillDays?: number;
    batchSize: number;
}

export interface ConnectorMetadata {
    id: string; // provider id e.g. shopify
    name: string;
    version: string;
    category: 'COMMERCE' | 'PAYMENT' | 'LOGISTICS' | 'MARKETING';
    author: string;
}

