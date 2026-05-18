import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { ConnectorRegistry } from '../../../../packages/connector-framework/src/registry';
import { IngestionPipeline } from './ingestion-pipeline.service';
import crypto from 'crypto';

export class SyncOrchestrator {

    /**
     * Runs a full synchronization cycle for all active integrations across the platform.
     */
    public static async runOrchestrationCycle() {
        console.log('[SyncOrchestrator] Starting global synchronization cycle...');
        
        for (const [siteId, instances] of GlobalMemoryStore.projectIntegrations.entries()) {
            for (const instance of instances) {
                if (instance.status !== 'ACTIVE') continue;

                try {
                    await this.syncInstance(instance);
                } catch (err) {
                    console.error(`[SyncOrchestrator] Failed to sync ${instance.id} (${instance.label}):`, err);
                }
            }
        }
        
        console.log('[SyncOrchestrator] Synchronization cycle complete.');
    }

    /**
     * Synchronizes a single integration instance.
     */
    public static async syncInstance(instance: any) {
        const connector = ConnectorRegistry.get(instance.providerId);
        if (!connector) {
            throw new Error(`Connector implementation for ${instance.providerId} not found`);
        }

        // 1. Resolve Credentials
        const credsList = GlobalMemoryStore.connectorCredentials.get(instance.id) || [];
        const activeCred = credsList[0]; // Simplification for MVP
        if (!activeCred) throw new Error('No credentials found for integration');

        const credentials = { vaultKey: activeCred.vaultKey }; 

        // 2. Prepare Metadata for Sync Run
        const correlationId = crypto.randomUUID();
        const startTime = new Date().toISOString();

        // 3. Execute Sync (Connector Layer)
        console.log(`[SyncOrchestrator] Syncing ${instance.label} (site=${instance.siteId})...`);
        const result = await connector.sync('INCREMENTAL', instance.syncConfig, credentials, instance.lastCheckpoint);

        // 4. Wrap & Intake (Ingestion Layer)
        // Every polling fetch is treated as a formal ingestion event
        const ingestionResult = await IngestionPipeline.intake({
            id: correlationId,
            mode: 'POLLING',
            tenantId: instance.tenantId,
            projectId: instance.siteId,
            integrationId: instance.id,
            connectorType: instance.connectorId,
            entityType: 'BULK_FETCH',
            receivedAt: new Date().toISOString(),
            payload: { 
                records: result.recordsProcessed, 
                checkpoint: result.checkpoint 
            }, // In real scenarios, this would be the raw batch
            metadata: {
                checkpoint: result.checkpoint
            }
        });

        // 5. Update Instance State
        instance.lastSyncAt = new Date().toISOString();
        instance.lastCheckpoint = result.checkpoint;
        
        if (result.error || ingestionResult.status === 'FAILED') {
            instance.healthStatus = 'DEGRADED';
            instance.lastError = { message: result.error || 'Ingestion failure', timestamp: instance.lastSyncAt };
        } else {
            instance.healthStatus = 'HEALTHY';
        }

        // 6. Log Lifecycle Event
        GlobalMemoryStore.connectorLifecycleEvents.push({
            id: crypto.randomUUID(),
            tenantId: instance.tenantId,
            projectId: instance.siteId,
            integrationId: instance.id,
            eventType: 'SYNC_COMPLETED',
            severity: (result.error || ingestionResult.status === 'FAILED') ? 'ERROR' : 'INFO',
            payload: { records: result.recordsProcessed, ingestionStatus: ingestionResult.status },
            triggeredBy: 'SYSTEM',
            createdAt: instance.lastSyncAt
        });

        console.log(`[SyncOrchestrator] ✓ Sync complete for ${instance.label}. Ingestion status: ${ingestionResult.status}`);
    }
}
