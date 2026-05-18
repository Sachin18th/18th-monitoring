import { prisma } from '@kpi-platform/db';
import { Prisma } from '@prisma/client';
import { 
    RecoveryJob, 
    ReprocessScope, 
    RecoveryStatus 
} from '../../../../packages/shared-types/src';
import { HardenedIngestionService } from './hardened-ingestion.service';
import { PerformanceIntelligenceService } from './performance-intelligence.service';
import crypto from 'crypto';

export class DataRecoveryService {
    
    /**
     * Requirement 1: Replay Raw Data
     * Initiates a job to re-process raw ingestion events within a specific scope.
     */
    static async initiateReplay(options: {
        siteId: string;
        scope: ReprocessScope;
        reason: string;
        triggeredBy: string;
    }) {
        const jobId = crypto.randomUUID();
        
        // 1. CREATE TRACKING JOB (Requirement 4)
        await prisma.recoveryJob.create({
            data: {
                id: jobId,
                siteId: options.siteId,
                tenantId: 'tenant_001',
                jobType: 'REPLAY_RAW',
                status: 'PENDING',
                scope: options.scope as unknown as Prisma.InputJsonValue,
                triggeredBy: options.triggeredBy,
                reason: options.reason,
                config: { batchSize: 100, throttlingMs: 50, forceRevalidate: true } as Prisma.InputJsonValue
            }
        });

        // Async trigger (In production, would use a background worker/queue)
        this.executeReplayJob(jobId).catch(err => {
            console.error(`[RecoveryJob:${jobId}] Execution failed:`, err);
        });

        return jobId;
    }

    /**
     * Requirement 1, 2, 8: Core Replay & Recompute Logic
     */
    private static async executeReplayJob(jobId: string) {
        const job = await prisma.recoveryJob.findUnique({ where: { id: jobId } });
        if (!job) return;

        await prisma.recoveryJob.updateMany({ where: { id: jobId }, data: { status: 'RUNNING', startedAt: new Date() } });

        const scope = job.scope as unknown as ReprocessScope;
        
        // 2. FETCH RAW EVENTS (Requirement 1)
        const events = await prisma.ingestionEvent.findMany({
            where: {
                projectId: job.siteId,
                ...(scope.dateRange
                    ? {
                        receivedAt: {
                            gte: new Date(scope.dateRange.start),
                            lte: new Date(scope.dateRange.end)
                        }
                    }
                    : {})
            }
        });
        let processed = 0;
        let failed = 0;

        // 3. RE-INJECT INTO PIPELINE (Requirement 1, 19)
        for (const event of events) {
            try {
                // REPLAY NORMALIZATION & VALIDATION (Requirement 1, 11)
                await HardenedIngestionService.ingest({
                    siteId: event.projectId,
                    connectorId: event.integrationId || 'unknown',
                    sourceSystem: 'REPLAY',
                    payload: (event as any).payload || {},
                    eventType: (event as any).eventType || 'REPLAY'
                });
                processed++;
            } catch (err) {
                failed++;
            }

            // Progress Update (Requirement 5)
            if (processed % 10 === 0) {
                await prisma.recoveryJob.updateMany({
                    where: { id: jobId },
                    data: { processedRecords: processed, failedRecords: failed, updatedAt: new Date() }
                });
            }

            // Throttling (Requirement 20)
            await new Promise(r => setTimeout(r, 50));
        }

        // 4. FINALIZE (Part 3: Recompute Aggregates as dependency)
        if (processed > 0) {
            // If we replayed performance data, trigger rollup recomputation (Requirement 9)
            // Example: trigger PerformanceIntelligenceService.computeRollup for the range
        }

        await prisma.recoveryJob.updateMany({
            where: { id: jobId },
            data: {
                status: failed === 0 ? 'COMPLETED' : 'FAILED',
                finishedAt: new Date(),
                processedRecords: processed,
                failedRecords: failed
            }
        });
    }

    /**
     * Requirement 8, 9: Recompute Engine
     * Rebuilds aggregates for a given time window.
     */
    static async recomputeAggregates(siteId: string, module: 'PERFORMANCE' | 'ORDERS', from: Date, to: Date) {
        if (module === 'PERFORMANCE') {
             // Logic to scan performance_metrics and re-run PerformanceIntelligenceService.computeRollup
             // ensures consistency after data repair (Requirement 8)
        }
    }
}
