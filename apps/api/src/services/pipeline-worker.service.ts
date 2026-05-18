import { IngestionEnvelope } from '@kpi-platform/shared-types';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { TransformationPipeline } from './transformation-pipeline.service';
import crypto from 'crypto';

export class PipelineWorker {

    /**
     * Bootstraps a tracked pipeline job for execution.
     * Integrates with the Jobs database layer to ensure state transitions are isolated and visible.
     */
    public static async dispatchTransformationJob(envelope: IngestionEnvelope): Promise<string> {
        const jobId = `job_${crypto.randomUUID()}`;
        
        // 1. Initial State: QUEUED
        const jobRecord = {
            id: jobId,
            siteId: envelope.projectId,
            tenantId: envelope.tenantId,
            integrationId: envelope.integrationId,
            type: 'TRANSFORMATION',
            status: 'QUEUED',
            correlationId: envelope.id,
            attempts: 0,
            maxRetries: 3,
            payloadRef: { envelopeId: envelope.id },
            createdAt: new Date().toISOString()
        };

        GlobalMemoryStore.pipelineJobs.push(jobRecord);
        console.log(`[Pipeline] 📦 Job ${jobId} QUEUED for transformation.`);

        // 2. Simulate Queue Execution Handoff
        setImmediate(() => this.execute(jobRecord, envelope));

        return jobId;
    }

    private static async execute(job: any, envelope: IngestionEnvelope) {
        job.status = 'RUNNING';
        job.startedAt = new Date().toISOString();
        job.attempts += 1;
        
        console.log(`[Pipeline] ▶ Job ${job.id} RUNNING (Attempt ${job.attempts}/${job.maxRetries})`);

        try {
            // Execute transformation and capture canonical result for KPI trigger
            const finalEntity = await TransformationPipeline.process(envelope);
            
            // Success
            job.status = 'COMPLETED';
            job.completedAt = new Date().toISOString();
            console.log(`[Pipeline] ✓ Job ${job.id} COMPLETED.`);

            // Phase 7: Emit KPI Aggregation trigger with canonical entity payload
            this.triggerAggregation(envelope, finalEntity);

        } catch (error: any) {
             console.error(`[Pipeline] ⨯ Job ${job.id} FAILED: ${error.message}`);
             
             // Retry Logic
             if (job.attempts < job.maxRetries) {
                 setTimeout(() => this.execute(job, envelope), 2000 * job.attempts); // Exponential backoff mock
             } else {
                 // Dead Letter Queue (DLQ) Fallback
                 job.status = 'DEAD_LETTERED';
                 job.errorSummary = { message: error.message, stack: error.stack };
                 
                 GlobalMemoryStore.deadLetterQueue.push({
                     id: `dlq_${crypto.randomUUID()}`,
                     jobId: job.id,
                     siteId: job.siteId,
                     tenantId: job.tenantId,
                     failureCategory: 'TRANSFORMATION_ERROR',
                     reason: error.message,
                     createdAt: new Date().toISOString()
                 });

                 console.error(`[Pipeline] ☠ Job ${job.id} moved to DEAD LETTER QUEUE.`);

                 // Phase 8: Trigger alert evaluation on DLQ growth
                 setImmediate(async () => {
                     try {
                         const { AlertEngine } = require('./alert-engine.service');
                         await AlertEngine.evaluateProject(job.siteId, job.tenantId);
                     } catch (e: any) {
                         console.error('[Pipeline] Alert evaluation after DLQ failed:', e.message);
                     }
                 });
             }
        }
    }

    private static triggerAggregation(envelope: IngestionEnvelope, finalEntity: any) {
        // This emits the "Event Processed" signal to trigger Phase 7 KPI aggregators
        // Aggregation layer receives the event, inspects the canonical writes, and increments values
        if (envelope.entityType === 'ORDER') {
            console.log(`[Pipeline] 📡 Emitting 'order.transformed' for aggregation layers.`);
            const { KpiEngine } = require('./kpi-engine/engine');
            KpiEngine.computeEventTriggered(
                envelope.projectId, 
                envelope.tenantId, 
                envelope.entityType, 
                finalEntity
            );
        }
    }
}
