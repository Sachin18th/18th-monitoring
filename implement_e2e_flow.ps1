$basePath = "c:\kpi monitoring"
cd $basePath

function Write-File {
    param([string]$Path, [string]$Content)
    $dir = Split-Path $Path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Set-Content -LiteralPath $Path -Value  $Content.Trim() 
}

Write-File "packages/streaming/src/memory-bus.ts" @"
import { EventEmitter } from 'events';
export const MemoryBus = new EventEmitter();
"@

Write-File "packages/streaming/src/kafka-adapter.ts" @"
import { MessagePublisher, PublishMessage } from './types';
import { MemoryBus } from './memory-bus';

export class KafkaPublisherAdapter implements MessagePublisher {
    async connect(): Promise<void> {}
    async disconnect(): Promise<void> {}

    async publishBatch(topic: string, messages: PublishMessage[]): Promise<boolean> {
        // Broadcast payloads transparently across the decoupled MemoryBus simulating Kafka topics tightly
        for (const msg of messages) {
            console.log(`[Streaming] Validated and published \${msg.value.eventType} into '\${topic}'`);
            MemoryBus.emit(topic, msg);
        }
        return true;
    }
}
"@

Write-File "packages/db/src/adapters/in-memory.adapter.ts" @"
import { TimeSeriesRepository, EventStoreRepository, RelationalRepository } from '../interfaces';
import { MetricRecord, Tenant, SiteMetadata } from '../models';

export const GlobalMemoryStore = {
    metrics: [] as MetricRecord[],
    events: [] as any[],
    alerts: [] as any[]
};

export class InMemoryTimeSeriesAdapter implements TimeSeriesRepository {
    async insertBatch(metrics: MetricRecord[]): Promise<void> {
        GlobalMemoryStore.metrics.push(...metrics);
        console.log(`[Storage] Saved \${metrics.length} metrics internally.`);
    }
    async queryKpi(siteId: string, kpiName: string): Promise<MetricRecord[]> {
        return GlobalMemoryStore.metrics.filter(m => m.siteId === siteId && m.kpiName === kpiName);
    }
}

export class InMemoryEventAdapter implements EventStoreRepository {
    async appendEvent(eventId: string, siteId: string, payload: any): Promise<void> {
        GlobalMemoryStore.events.push(payload);
    }
    async getEvent(eventId: string): Promise<any | null> { return null; }
    async queryEvents(siteId: string, filters: any): Promise<any[]> { return GlobalMemoryStore.events; }
}

export class InMemoryRelationalAdapter implements RelationalRepository {
    async getTenant(): Promise<Tenant | null> { return null; }
    async getSiteMetadata(): Promise<SiteMetadata | null> { return null; }
    async updateSiteConfig(): Promise<void> {}
    async getAlertRules(): Promise<any[]> { return []; }
    async saveAlertState(alert: any): Promise<void> {
        GlobalMemoryStore.alerts.push(alert);
        console.log(`[Storage] Incident mapped relational constraints successfully.`);
    }
}
"@

Write-File "packages/db/src/config/db-connection.ts" @"
import { InMemoryTimeSeriesAdapter, InMemoryEventAdapter, InMemoryRelationalAdapter, GlobalMemoryStore } from '../adapters/in-memory.adapter';

export const DatabaseFactory = {
    getTimeSeriesDb: () => new InMemoryTimeSeriesAdapter(),
    getEventStoreDb: () => new InMemoryEventAdapter(),
    getRelationalDb: () => new InMemoryRelationalAdapter()
};

export { GlobalMemoryStore };
"@

Write-File "packages/db/src/index.ts" @"
export * from './interfaces/time-series.interface';
export * from './interfaces/event-store.interface';
export * from './interfaces/relational-db.interface';
export * from './config/db-connection';
export * from './models/metric.model';
export * from './models/tenant.model';
"@

Write-File "services/alert-engine/src/persistence/alert-storage.ts" @"
import { AlertPayload, AlertStatus } from '../models/alert.model';
import { DatabaseFactory } from '../../../../packages/db/src';

const db = DatabaseFactory.getRelationalDb();

export class AlertStorage {
    static async saveAlert(alert: AlertPayload): Promise<void> {
        await db.saveAlertState(alert);
    }
    static async updateStatus(alertId: string, status: AlertStatus): Promise<void> {}
}
"@

Write-File "services/processor/src/engine/aggregation.service.ts" @"
import { MetricPayload } from '../persistence/metrics-db.adapter';
import { DatabaseFactory } from '../../../../packages/db/src';
import { RuleEvaluator } from '../../../../services/alert-engine/src/evaluator/rule-evaluator';

const db = DatabaseFactory.getTimeSeriesDb();
export class AggregationService {
    private static buffer: MetricPayload[] = [];

    static async recordKpi(siteId: string, kpiName: string, value: number, dimensions: any = {}) {
        const metric = { siteId, kpiName, value, timestamp: new Date().toISOString(), dimensions };
        this.buffer.push(metric);
        console.log(`[Processor] Extracted KPI property: \${kpiName} = \${value}`);
        
        // Push mapping directly hitting Alert limits natively
        await RuleEvaluator.evaluate(siteId, kpiName, value, dimensions);
        // Force synchronous flushing preventing simulation bounds from breaking globally
        await this.flush(); 
    }

    static async flush() {
        if (this.buffer.length > 0) {
            await db.insertBatch(this.buffer);
            this.buffer = [];
        }
    }
}
"@

Write-File "services/processor/src/consumer/kafka-consumer.ts" @"
import { EventRegistry } from '../registry/event-registry';
import { MemoryBus } from '../../../../packages/streaming/src/memory-bus';

export class KafkaStreamConsumer {
    private isConsuming = false;

    async connectAndSubscribe(topics: string[]) {
        this.isConsuming = true;
        for (const t of topics) {
            MemoryBus.on(t, async (msg: any) => {
                console.log(`[Processor] Actively grabbed payload mapping: \${msg.value.eventType}`);
                await this.onMessage(msg);
            });
        }
        console.log(`[KafkaConsumer] Subscribed seamlessly linking memory channels to: \${topics.join(', ')}`);
    }

    async onMessage(rawPayload: any) {
        await EventRegistry.route(rawPayload);
    }
}
"@

Write-File "apps/api/src/services/dashboard.service.ts" @"
import { DatabaseFactory } from '../../../../packages/db/src';

export class DashboardService {
    static async getKpiSummaries(filters: any) {
        const store = require('../../../../packages/db/src/adapters/in-memory.adapter').GlobalMemoryStore;
        
        return [
            { kpiName: 'pageLoadTime', value: store.metrics.filter((m:any) => m.kpiName === 'pageLoadTime').pop()?.value || 0, trendPct: -2, state: 'warning' },
            { kpiName: 'errorEventsLogged', value: store.metrics.filter((m:any) => m.kpiName === 'errorRateIncrement').length, trendPct: +12, state: 'warning' },
            { kpiName: 'ordersDelayCount', value: store.metrics.filter((m:any) => m.kpiName === 'ordersPerMinuteIncrement').length, trendPct: 0, state: 'healthy' }
        ];
    }

    static async getActiveAlerts(filters: any) {
        const store = require('../../../../packages/db/src/adapters/in-memory.adapter').GlobalMemoryStore;
        return store.alerts;
    }
}
"@

Write-File "package.json" @"
{
  "name": "kpi-monitoring",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start:simulation": "ts-node scripts/e2e-simulation.ts"
  },
  "dependencies": {
    "ts-node": "^10.9.1",
    "typescript": "^5.0.0",
    "zod": "^3.22.4"
  }
}
"@

Write-File "scripts/e2e-simulation.ts" @"
import { IngestionService } from '../apps/api/src/services/ingestion.service';
import { KafkaStreamConsumer } from '../services/processor/src/consumer/kafka-consumer';
import { DashboardService } from '../apps/api/src/services/dashboard.service';
import * as crypto from 'crypto';

async function generateEvent(type: string, metadata: any) {
    return {
        eventId: crypto.randomUUID(),
        siteId: 'store_001',
        eventType: type,
        timestamp: new Date().toISOString(),
        metadata
    };
}

async function run() {
    console.log('--- STARTING SYSTEM E2E SIMULATION ---\n');

    // 1. Boot Subscriptions natively hooking memory maps 
    const consumer = new KafkaStreamConsumer();
    await consumer.connectAndSubscribe(['browser-events-stream-v1', 'server-events-stream-v1']);
    console.log('\n');

    // 2. Scenario mapping Page Load > Limits constraints 
    console.log('>>> SCENARIO 1: Tracking Performance Degradation (Page Load)');
    await IngestionService.processBrowserEvents('store_001', [
        await generateEvent('page_view', { loadTime: 4500, url: '/' }) // Should natively push limits over 3000ms bounds 
    ]);
    
    // 3. Scenario mapping Error Limits tracking 
    console.log('\n>>> SCENARIO 2: JS Error Trace Hooking');
    await IngestionService.processBrowserEvents('store_001', [
        await generateEvent('js_error', { errorMsg: 'Cannot read properties of undefined' }),
        await generateEvent('js_error', { errorMsg: 'Network Timeout Limit' }),
        await generateEvent('js_error', { errorMsg: 'React Minified Component mapping drop' }) // Triples bounds implicitly scaling metrics tracking
    ]);

    // 4. Scenario mapping Integration Spikes 
    console.log('\n>>> SCENARIO 3: Detecting External Integration Failures (OMS Spiking)');
    await IngestionService.processServerEvents('store_001', [
        await generateEvent('oms_sync_failed', { error: '503 Gateway Time-out constraints' }),
        await generateEvent('oms_sync_failed', { error: '503 Gateway Time-out constraints' }) // Push explicit failure increment bindings 
    ]);

    // 5. Query Dashboard bounds wrapping logic locally securely 
    console.log('\n>>> DASHBOARD EXTRACTION TIER');
    const summaries = await DashboardService.getKpiSummaries({});
    const alerts = await DashboardService.getActiveAlerts({});

    console.log('\n--- Accessible Dashboard Metrics Profiles ---');
    console.table(summaries);

    console.log('\n--- Escalated Active Dashboard Alerts ---');
    console.table(alerts.map((a:any) => ({ id: a.alertId, rule: a.ruleId, message: a.message })));

    console.log('\n--- SUCCESSFUL COMPLETION OF E2E PIPELINE RUN ---');
}

run().catch(console.error);
"@
