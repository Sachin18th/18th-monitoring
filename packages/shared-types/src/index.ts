export * from './config';
import { z } from 'zod';
import { BaseEventSchema, BrowserIngestPayloadSchema, ServerIngestPayloadSchema } from '../../events/src/schemas';

export type BaseEvent = z.infer<typeof BaseEventSchema>;
export type BrowserIngestPayload = z.infer<typeof BrowserIngestPayloadSchema>;
export type ServerIngestPayload = z.infer<typeof ServerIngestPayloadSchema>;

export type Role = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'PROJECT_ADMIN' | 'OPERATOR' | 'VIEWER' | 'CUSTOMER';
export type UserStatus = 'active' | 'suspended' | 'inactive';
export type ProjectStatus = 'ACTIVE' | 'MAINTENANCE' | 'ARCHIVED';

export interface UserAudit {
    createdAt: string;
    lastLoginAt?: string;
    lastIp?: string;
    updatedAt: string;
}

export interface User {
    id: string;
    email: string;
    name: string;
    role: Role;
    status: UserStatus;
    tenantId: string; // Every user belongs to a tenant
    passwordHash?: string; // Stored securely
    assignedProjects: string[]; // array of siteIds
    audit: UserAudit;
}

export interface Project {
    id: string; // siteId
    tenantId: string; // Mandatory scoping
    name: string;
    slug: string; // URL-friendly identifier
    description?: string;
    status: ProjectStatus;
    organizationId?: string;
    lastActivity?: string;
    configMetadata?: Record<string, any>;
    createdBy?: string;
    createdAt: string;
    updatedAt: string;
    metricsSummary?: {
        activeUsers: number;
        errorRate: number;
        revenue?: number;
    };
}

export interface AuthSession {
    token: string;
    user: Omit<User, 'passwordHash'>;
    expiresAt: string;
}

export interface OrderEventMetadata {
    orderId: string;
    value?: number;
    source?: string;
    error?: string;
}

export interface PageViewMetadata {
    url: string;
    loadTime?: number;
}

// --- Orders Intelligence Domain Types ---

export type OrderChannel = 
    | 'ONLINE_STOREFRONT' 
    | 'OFFLINE_POS' 
    | 'MARKETPLACE' 
    | 'MANUAL_ORDER' 
    | 'ERP_CREATED' 
    | 'CALL_CENTER' 
    | 'CSV_IMPORTED' 
    | 'UNKNOWN_CHANNEL';

export type CanonicalLifecycleState = 
    | 'CREATED'
    | 'PENDING_PAYMENT'
    | 'PAYMENT_AUTHORIZED'
    | 'PAID'
    | 'ALLOCATED'
    | 'PACKED'
    | 'PARTIALLY_SHIPPED'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'PARTIALLY_RETURNED'
    | 'RETURNED'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED'
    | 'CANCELLED'
    | 'FAILED'
    | 'EXCEPTION';

export type OrderIntelligenceState = 
    | 'HEALTHY'
    | 'DELAYED'
    | 'STUCK'
    | 'MISMATCHED'
    | 'PARTIALLY_SYNCED'
    | 'STALE'
    | 'HIGH_RISK'
    | 'REQUIRES_REVIEW'
    | 'RECONCILED';

export interface FinancialSummary {
    currency: string;
    subtotal: number;
    tax: number;
    shipping: number;
    discount: number;
    grandTotal: number;
    paidAmount: number;
    refundedAmount: number;
    balanceDue: number;
}

export interface CanonicalOrder {
    id: string; // Internal UUID
    orderId: string; // Source/Display order number
    externalReferenceId?: string; // Other system ID (OMS/ERP)
    tenantId: string;
    siteId: string;
    sourceSystem: string;
    channel: OrderChannel;
    lifecycleState: CanonicalLifecycleState;
    intelligenceState: OrderIntelligenceState;
    financials: FinancialSummary;
    
    // Milestones & Aging (Requirement 11)
    timestamps: {
        created: string;
        updated: string;
        paid?: string;
        allocated?: string;
        shipped?: string;
        delivered?: string;
        cancelled?: string;
        refunded?: string;
    };
    
    lineItems: Array<{
        sku: string;
        quantity: number;
        unitPrice: number;
        total: number;
    }>;
    
    // Traceability (Requirement 18)
    mappingVersion: string;
    validationState: ValidationStatus;
    qualityState: DataQualityState;
    confidenceScore: number;
    
    metadata: Record<string, any>;
}


// --- Hardening Layer Types ---

export type IngestionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'RETRYING';
export type ValidationStatus = 'PENDING' | 'VALID' | 'WARNING' | 'QUARANTINED' | 'REJECTED';

export type BackendErrorCategory = 
    | 'AUTH_ERROR'
    | 'PERMISSION_ERROR'
    | 'NETWORK_ERROR'
    | 'TIMEOUT_ERROR'
    | 'RATE_LIMIT_ERROR'
    | 'SCHEMA_ERROR'
    | 'VALIDATION_ERROR'
    | 'TRANSFORMATION_ERROR'
    | 'PROCESSING_ERROR'
    | 'STORAGE_ERROR'
    | 'RECONCILIATION_ERROR'
    | 'UNKNOWN_ERROR';

export interface IngestionMetadata {
    siteId: string;
    tenantId?: string;
    connectorId: string;
    sourceSystem: string;
    sourceEventId?: string;
    sourceTimestamp?: string;
    eventType: string;
    schemaVersion: string;
    correlationId: string;
    traceId: string;
    provenance?: Record<string, any>;
}

export interface ProcessingMetadata {
    status: IngestionStatus;
    validationStatus: ValidationStatus;
    retryCount: number;
    lastError?: {
        category: BackendErrorCategory;
        message: string;
        timestamp: string;
        stack?: string;
    };
}

// --- Integrations Lifecycle & Health Types ---

export type ConnectorLifecycleState = 
    | 'DRAFT'
    | 'CONFIG_PENDING'
    | 'AUTH_PENDING'
    | 'VALIDATION_PENDING'
    | 'CONNECTED'
    | 'ACTIVE'
    | 'DEGRADED'
    | 'THROTTLED'
    | 'STALE'
    | 'PAUSED'
    | 'ERROR'
    | 'DISCONNECTED'
    | 'ARCHIVED';

export interface ConnectorHealthDimensions {
    connectivity: boolean;
    authentication: boolean;
    permissions: boolean;
    sync: boolean;
    webhook: boolean;
    freshness: boolean;
    schema: boolean;
    rateLimit: boolean;
    reconciliation: boolean;
    processing: boolean;
}

export type IntegrationCategory = 
    | 'ERP' | 'CRM' | 'OMS' | 'COMMERCE'
    | 'PAYMENT_GATEWAY' | 'SHIPPING_GATEWAY' 
    | 'ANALYTICS' | 'MARKETPLACE' | 'MARKETING' 
    | 'CUSTOM_API' | 'FILE_BASED' | 'WEBHOOK_SOURCE';

export interface ConnectorInstanceMetadata {
    connectorId: string;
    siteId: string;
    tenantId: string;
    providerName: string;
    category: IntegrationCategory;
    environment: 'production' | 'sandbox' | 'development';
    version: string;
    enabled: boolean;
    lastSyncAt?: string;
    lastAttemptAt?: string;
    lastWebhookAt?: string;
    healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    lifecycleState: ConnectorLifecycleState;
    configVersion: string;
}

export type ConnectorCapability = 
    | 'OAUTH' 
    | 'API_KEY' 
    | 'WEBHOOKS' 
    | 'POLLING' 
    | 'DISCOVERY' 
    | 'BACKFILL' 
    | 'INCREMENTAL_SYNC' 
    | 'RECONCILIATION' 
    | 'HEALTH_PROBE';

export interface ConnectorRegistryEntry {
    type: string;
    family: IntegrationCategory;
    name: string;
    description: string;
    capabilities: ConnectorCapability[];
    version: string;
}

export type IntegrationSyncType = 'INITIAL_BACKFILL' | 'INCREMENTAL' | 'RECONCILIATION' | 'MANUAL_RESYNC';

export interface IntegrationCredentialRef {
    authType: 'OAUTH2' | 'API_KEY' | 'BASIC' | 'BEARER';
    vaultKey: string; // Reference to external vault or encrypted field
    expiresAt?: string;
    lastRotatedAt?: string;
    scopes?: string[];
}

export interface IntegrationLifecycleEvent {
    id: string;
    tenantId: string;
    projectId: string; // siteId
    integrationId: string;
    type: string; // e.g., 'AUTH_SUCCESS', 'SYNC_FAILED'
    severity: 'INFO' | 'WARNING' | 'ERROR';
    payload: any;
    correlationId: string;
    triggeredBy: 'SYSTEM' | 'USER';
    createdAt: string;
}

// --- Data Integrity & Reconciliation Types ---

export type DataQualityState = 
    | 'VALID'
    | 'WARNING'
    | 'QUARANTINED'
    | 'REJECTED'
    | 'PENDING_REVIEW'
    | 'RECONCILED'
    | 'MISMATCH_DETECTED'
    | 'REPROCESSED';

export type MismatchCategory = 
    | 'MISSING_RECORD'
    | 'DUPLICATE_RECORD'
    | 'STALE_RECORD'
    | 'COUNT_MISMATCH'
    | 'FIELD_MISMATCH'
    | 'STATUS_MISMATCH'
    | 'TOTAL_MISMATCH'
    | 'FRESHNESS_BREACH'
    | 'SCHEMA_DRIFT'
    | 'MAPPING_DRIFT'
    | 'SEQUENCE_GAP'
    | 'PARTIAL_SYNC_GAP'
    | 'AGGREGATION_DRIFT'
    | 'UNKNOWN_MISMATCH';

export interface ReconciliationJobSummary {
    jobId: string;
    domain: 'ORDERS' | 'CUSTOMERS' | 'PERFORMANCE' | 'INTEGRATIONS';
    siteId: string;
    connectorId?: string;
    range: { start: string; end: string };
    counts: {
        examined: number;
        matched: number;
        mismatched: number;
        repaired: number;
    };
    confidenceScore: number; // 0.0 - 1.0
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    mismatches: MismatchDetail[];
}

export interface MismatchDetail {
    entityId: string;
    category: MismatchCategory;
    severity: 'CRITICAL' | 'HIGH' | 'LOW';
    sourceLayer: string; // e.g., 'API', 'RAW', 'NORMALIZED'
    targetLayer: string;
    field?: string;
    expectedValue?: any;
    actualValue?: any;
    explanation: string;
    recoverable: boolean;
}

// --- Performance Analytics Intelligence Types ---

export type MetricCategory = 'RUM' | 'SYSTEM' | 'API' | 'INFRASTRUCTURE';

export type PerformanceMetricName = 
    | 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB' // RUM
    | 'API_LATENCY' | 'DB_LATENCY' | 'CACHE_LATENCY' | 'QUEUE_LAG' // SYSTEM
    | 'ERROR_RATE' | 'THROUGHPUT';

export interface PerformanceSignal {
    id: string;
    siteId: string;
    tenantId?: string;
    environment: string;
    category: MetricCategory;
    name: PerformanceMetricName;
    value: number;
    unit: 'ms' | 's' | '%' | 'count';
    timestamp: string;
    
    // Dimensions (Requirement 7)
    dimensions: {
        region?: string;
        device?: string;
        browser?: string;
        os?: string;
        network?: string;
        route?: string;
        service?: string;
        release?: string;
        featureFlags?: string[];
    };
    
    traceId?: string;
    correlationId?: string;
}

export interface PerformanceRollup {
    siteId: string;
    metricName: PerformanceMetricName;
    bucketSize: '1m' | '5m' | '1h' | '1d';
    timestamp: string;
    
    // Stats (Requirement 5)
    count: number;
    min: number;
    max: number;
    avg: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
    
    dimensions: Record<string, string | undefined>;
}

// --- Customer Intelligence Types ---

export type CustomerLifecycleState = 
    | 'NEW_VISITOR' 
    | 'RETURNING_VISITOR' 
    | 'ENGAGED_USER' 
    | 'CART_STARTER' 
    | 'CHECKOUT_STARTER' 
    | 'PURCHASER' 
    | 'REPEAT_PURCHASER' 
    | 'CHURN_RISK' 
    | 'DORMANT';

export interface CustomerProfile {
    id: string; // Internal UUID
    siteId: string;
    tenantId?: string;
    
    // Identity (Requirement 1)
    externalIds: Record<string, string>; // { shopify: '...', crm: '...' }
    emailHash?: string;
    phoneHash?: string;
    
    // Lifecycle (Requirement 14)
    lifecycleState: CustomerLifecycleState;
    identityConfidence: number; // 0.0 - 1.0
    
    // Stats
    firstSeenAt: string;
    lastSeenAt: string;
    totalOrders: number;
    totalRevenue: number;
    
    metadata: Record<string, any>;
}

export interface CustomerEvent {
    id: string;
    customerId: string;
    siteId: string;
    sessionId: string;
    
    // Taxonomy (Requirement 4)
    eventName: string;
    eventCategory: 'ACQUISITION' | 'VIEW' | 'INTERACTION' | 'CART' | 'PURCHASE' | 'RETENTION';
    
    timestamp: string;
    url?: string;
    referrer?: string;
    
    // Attribution (Requirement 12)
    utm?: {
        source?: string;
        medium?: string;
        campaign?: string;
        content?: string;
        term?: string;
    };
    
    metadata: Record<string, any>;
}

export interface CustomerSession {
    id: string;
    customerId: string;
    siteId: string;
    
    startTime: string;
    endTime?: string;
    durationSeconds?: number;
    
    entryPage?: string;
    exitPage?: string;
    eventCount: number;
    isConverted: boolean;
    
    device: string;
    browser: string;
    os: string;
}

// --- Observability & Alerting Types ---

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertStatus = 'TRIGGERED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'AUTO_RESOLVED';

export interface SystemAlert {
    id: string;
    siteId: string;
    severity: AlertSeverity;
    status: AlertStatus;
    
    // Taxonomy (Requirement 8)
    module: 'INTEGRATIONS' | 'ORDERS' | 'PERFORMANCE' | 'CUSTOMER' | 'INFRA';
    alertType: string;
    message: string;
    
    // Context (Requirement 11)
    context: Record<string, any>;
    correlationId?: string;
    
    triggeredAt: string;
    resolvedAt?: string;
    acknowledgedAt?: string;
    acknowledgedBy?: string;
}

export interface AlertRule {
    id: string;
    siteId: string;
    name: string;
    description: string;
    severity: AlertSeverity;
    enabled: boolean;
    
    // Engine Logic (Requirement 7)
    criteria: {
        metricName: string;
        operator: 'GT' | 'LT' | 'EQ' | 'CHANGE_PERCENT';
        threshold: number;
        windowMinutes: number;
    };
    
    cooldownMinutes: number;
}

export interface AuditEntry {
    id: string;
    siteId: string;
    actorId: string; // user or system:id
    action: string;
    entityType: string;
    entityId: string;
    
    // Change Tracking (Requirement 12)
    previousValue?: any;
    newValue?: any;
    
    timestamp: string;
    metadata: Record<string, any>;
}

export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface StructuredLog {
    timestamp: string;
    level: LogLevel;
    message: string;
    module: string;
    siteId?: string;
    correlationId?: string;
    traceId?: string;
    metadata: Record<string, any>;
}

// --- Backfill, Replay & Recovery Types ---

export type RecoveryStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface ReprocessScope {
    siteId: string;
    connectorId?: string;
    dateRange?: { start: string; end: string };
    eventIds?: string[];
    entityIds?: string[];
    failureCategory?: BackendErrorCategory;
}

export interface RecoveryJob {
    id: string;
    siteId: string;
    jobType: 'REPLAY_RAW' | 'REPROCESS_NORMALIZED' | 'RECOMPUTE_AGGREGATES' | 'BACKFILL_HISTORICAL';
    status: RecoveryStatus;
    
    // Scoping (Requirement 3)
    scope: ReprocessScope;
    
    // Progress (Requirement 5)
    totalRecords: number;
    processedRecords: number;
    failedRecords: number;
    
    // Metadata (Requirement 4)
    triggeredBy: string;
    reason: string;
    
    startedAt: string;
    updatedAt: string;
    finishedAt?: string;
    
    config: {
        batchSize: number;
        throttlingMs: number;
        forceRevalidate: boolean;
    };
}

// --- Ingestion Layer Types (Phase 4) ---

export type IngestionMode = 'WEBHOOK' | 'POLLING' | 'FILE_IMPORT' | 'MANUAL_ENTRY' | 'SYNTHETIC';

export type IngestionProcessingStatus = 
    | 'RECEIVED'
    | 'VALIDATING'
    | 'REJECTED'
    | 'ARCHIVED'
    | 'QUEUED'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'FAILED'
    | 'DEAD_LETTERED';

export interface IngestionValidationReport {
    isValid: boolean;
    stages: {
        auth: { status: 'PASS' | 'FAIL' | 'SKIP'; message?: string };
        scope: { status: 'PASS' | 'FAIL'; message?: string };
        schema: { status: 'PASS' | 'FAIL' | 'SKIP'; message?: string };
        dedupe: { status: 'PASS' | 'FAIL'; isDuplicate: boolean };
    };
    errors: string[];
    warnings: string[];
}

export interface IngestionEnvelope {
    id: string; // Internal correlation ID
    mode: IngestionMode;
    tenantId: string;
    projectId: string; // siteId
    integrationId?: string;
    connectorType?: string;
    
    entityType: string; // e.g., 'ORDER', 'PRODUCT', 'CUSTOMER'
    sourceEventId?: string; // Original ID from source
    receivedAt: string;
    
    rawPayloadRef?: string; // Reference to archived artifact
    payload: any; // Raw or structured payload
    
    metadata: {
        sourceIp?: string;
        userAgent?: string;
        headers?: Record<string, string>;
        checkpoint?: any; // For polling cursor
        [key: string]: any;
    };
}

export interface IngestionEventRecord {
    id: string;
    envelopeId: string;
    tenantId: string;
    projectId: string;
    integrationId?: string;
    
    mode: IngestionMode;
    status: IngestionProcessingStatus;
    validation: IngestionValidationReport;
    
    sourceReferenceId?: string;
    receivedAt: string;
    updatedAt: string;
    
    artifactId?: string;
    queueMessageId?: string;
    error?: {
        code: string;
        message: string;
    };
}

export interface RawIngestionArtifact {
    id: string;
    ingestionEventId: string;
    type: 'WEBHOOK_PAYLOAD' | 'API_RESPONSE' | 'FILE_UPLOAD';
    storagePath: string; // or object key
    contentType: string;
    size: number;
    checksum: string;
    createdAt: string;
}







