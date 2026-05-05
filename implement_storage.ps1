$basePath = "c:\kpi monitoring"
cd $basePath

function Write-File {
    param([string]$Path, [string]$Content)
    $dir = Split-Path $Path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Set-Content -Path $Path -Value  $Content.Trim() -Encoding UTF8
}

Write-File "packages/db/src/models/tenant.model.ts" @"
export interface Tenant {
    tenantId: string;
    name: string;
    createdAt: string;
}

export interface SiteMetadata {
    siteId: string;
    tenantId: string;
    domain: string;
    status: 'active' | 'suspended';
    config: Record<string, any>; // JSON tracking config definitions
}
"@

Write-File "packages/db/src/models/metric.model.ts" @"
export interface MetricRecord {
    siteId: string;
    timestamp: string;
    kpiName: string;
    value: number;
    dimensions: Record<string, string>;
}
"@

Write-File "packages/db/src/interfaces/time-series.interface.ts" @"
import { MetricRecord } from '../models/metric.model';

/**
 * Interface mapping Time-Series operations.
 * Consumed strictly by Processor (writing) and Dashboard (querying metrics).
 */
export interface TimeSeriesRepository {
    insertBatch(metrics: MetricRecord[]): Promise<void>;
    queryKpi(siteId: string, kpiName: string, startTime: string, endTime: string, dimensions?: any): Promise<MetricRecord[]>;
}
"@

Write-File "packages/db/src/interfaces/event-store.interface.ts" @"
/**
 * Interface mapping Raw Event logging operations.
 * Consumed by: Processor (Delayed logic matching), Dashboard (Log Drilldown), Agent (Event Backup).
 */
export interface EventStoreRepository {
    appendEvent(eventId: string, siteId: string, payload: any): Promise<void>;
    getEvent(eventId: string): Promise<any | null>;
    queryEvents(siteId: string, filters: any): Promise<any[]>;
}
"@

Write-File "packages/db/src/interfaces/relational-db.interface.ts" @"
import { Tenant, SiteMetadata } from '../models/tenant.model';

/**
 * Repository interface mapping strictly relational/ACID required data.
 * Consumed by: Config Manager, Alert Engine, Dashboard, and Ingestion APIs.
 */
export interface RelationalRepository {
    // Tenant & Config
    getTenant(tenantId: string): Promise<Tenant | null>;
    getSiteMetadata(siteId: string): Promise<SiteMetadata | null>;
    updateSiteConfig(siteId: string, config: any): Promise<void>;

    // Alerts
    getAlertRules(siteId: string): Promise<any[]>;
    saveAlertState(alert: any): Promise<void>;
}
"@

Write-File "packages/db/src/adapters/clickhouse-ts.adapter.ts" @"
import { TimeSeriesRepository } from '../interfaces/time-series.interface';
import { MetricRecord } from '../models/metric.model';

export class ClickHouseAdapter implements TimeSeriesRepository {
    // TODO: Setup official ClickHouse connection pooling securely
    // TODO: Design partitioning strategy (e.g. partition by toYYYYMMDD(timestamp) mapping to memory vs cold blocks)
    // TODO: Define aggressive TTL retention configurations for pruning historical KPIs properly

    async insertBatch(metrics: MetricRecord[]): Promise<void> {
        console.log(`[ClickHouseAdapter] Mock inserting \${metrics.length} metric properties.`);
    }

    async queryKpi(siteId: string, kpiName: string, startTime: string, endTime: string, dimensions?: any): Promise<MetricRecord[]> {
        // Query engine routing specifically mapping for the Next.js Dashboards
        console.log(`[ClickHouseAdapter] Mock querying \${kpiName} for \${siteId}`);
        return [];
    }
}
"@

Write-File "packages/db/src/adapters/elastic-event.adapter.ts" @"
import { EventStoreRepository } from '../interfaces/event-store.interface';

export class ElasticEventAdapter implements EventStoreRepository {
    // TODO: Implement interface abstraction pointing to an Elasticsearch or simple S3 blob
    // TODO: Strategy Indexing: Rebuild strict secondary indices mapped cleanly around 'siteId' and 'eventType'
    // TODO: Provide cold storage backup workflows for dropped indices

    async appendEvent(eventId: string, siteId: string, payload: any): Promise<void> {
        console.log(`[EventStore] Appending raw payload array: \${eventId}`);
    }

    async getEvent(eventId: string): Promise<any | null> {
        return null; // For pipeline latency matching checks
    }

    async queryEvents(siteId: string, filters: any): Promise<any[]> {
        return []; // For dashboard troubleshooting drill down views
    }
}
"@

Write-File "packages/db/src/adapters/postgres-relational.adapter.ts" @"
import { RelationalRepository } from '../interfaces/relational-db.interface';
import { Tenant, SiteMetadata } from '../models/tenant.model';

export class PostgresAdapter implements RelationalRepository {
    // TODO: Integrate TypeORM bindings handling database transactions smoothly
    // TODO: Implement native Multi-Tenant isolation (Row-Level Security depending on strict tenant boundaries)
    // TODO: Implement B-Tree indexing on alert states resolving latency loops

    async getTenant(tenantId: string): Promise<Tenant | null> {
        return null;
    }

    async getSiteMetadata(siteId: string): Promise<SiteMetadata | null> {
        return null;
    }

    async updateSiteConfig(siteId: string, config: any): Promise<void> {
        console.log(`[PostgresAdapter] Updated master configuration JSON for \${siteId}`);
    }

    async getAlertRules(siteId: string): Promise<any[]> {
        return [];
    }

    async saveAlertState(alert: any): Promise<void> {
        console.log(`[PostgresAdapter] Storing alert lifecycle block.`);
    }
}
"@

Write-File "packages/db/src/config/db-connection.ts" @"
import { ClickHouseAdapter } from '../adapters/clickhouse-ts.adapter';
import { ElasticEventAdapter } from '../adapters/elastic-event.adapter';
import { PostgresAdapter } from '../adapters/postgres-relational.adapter';

// Service locator singleton pattern ensuring mockable adapters
export const DatabaseFactory = {
    getTimeSeriesDb: () => new ClickHouseAdapter(),
    getEventStoreDb: () => new ElasticEventAdapter(),
    getRelationalDb: () => new PostgresAdapter()
};

// TODO: Extract database DNS names from environment properties reliably here.
"@

Write-File "packages/db/src/index.ts" @"
export * from './interfaces/time-series.interface';
export * from './interfaces/event-store.interface';
export * from './interfaces/relational-db.interface';
export * from './config/db-connection';
export * from './models/metric.model';
export * from './models/tenant.model';
"@
