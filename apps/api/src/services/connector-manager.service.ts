import { prisma } from '@kpi-platform/db';
import { 
    ConnectorLifecycleState, 
    ConnectorHealthDimensions,
    IntegrationCategory
} from '../../../../packages/shared-types/src';

export class ConnectorManagerService {
    /**
     * Records a health signal for a specific dimension.
     * Requirement 3 (Multidimensional Health Model)
     */
    static async recordHealthSignal(connectorId: string, dimension: keyof ConnectorHealthDimensions, isHealthy: boolean, error?: any) {
        // In production:
        // 1. Fetch current health dimensions for this connector
        // 2. Update the specific dimension
        // 3. Recompute overall status
        // 4. If status changed, Log to connectorHealthSnapshots and auditLogs
        console.log(`[ConnectorManager] Health signal for ${connectorId}: ${dimension} = ${isHealthy}`);
    }

    /**
     * Transitions a connector through its lifecycle.
     * Requirement 2 (Formal lifecycle states)
     */
    static async transitionState(instanceId: string, newState: ConnectorLifecycleState) {
        const timestamp = new Date();
        try {
            await prisma.connectorInstance.updateMany({
                where: { id: instanceId },
                data: {
                    lifecycleState: newState,
                    updatedAt: timestamp
                }
            });
            
            console.log(`[ConnectorManager] Connector ${instanceId} transitioned to ${newState}`);
        } catch (err) {
            console.error(`[ConnectorManager] Failed to transition connector ${instanceId}:`, err);
        }
    }

    /**
     * Starts a sync run.
     * Requirement 5 (Harden polling and sync orchestration)
     */
    static async startSyncRun(instanceId: string, siteId: string, syncType: 'POLL' | 'WEBHOOK' | 'BACKFILL') {
        const runId = Math.random().toString(36).substring(7);
        try {
            await prisma.connectorSyncRun.create({
                data: {
                    id: runId,
                    connectorInstanceId: instanceId,
                    syncType,
                    status: 'RUNNING',
                    startedAt: new Date()
                }
            });

            await prisma.connectorInstance.updateMany({
                where: { id: instanceId },
                data: { lastAttemptAt: new Date() }
            });

            return runId;
        } catch (err) {
            console.error(`[ConnectorManager] Failed to start sync run for ${instanceId}:`, err);
            return null;
        }
    }

    /**
     * Completes a sync run with summary metrics.
     */
    static async completeSyncRun(instanceId: string, siteId: string, metrics: { fetched: number, processed: number, rejected: number, checkpoint?: string }) {
        const timestamp = new Date();
        try {
            // Update last successful sync
            await prisma.connectorInstance.updateMany({
                where: { id: instanceId },
                data: {
                    lastSyncAt: timestamp,
                    healthStatus: 'HEALTHY',
                    lifecycleState: metrics.rejected > 0 ? 'DEGRADED' : 'ACTIVE'
                }
            });

            // Record success signal
            await this.recordHealthSignal(instanceId, 'sync', true);
        } catch (err) {
            console.error(`[ConnectorManager] Failed to complete sync run for ${instanceId}:`, err);
        }
    }

    /**
     * Computes freshness status based on cadence rules.
     * Requirement 7 (Connector freshness and SLA tracking)
     */
    static async checkFreshness(connectorId: string, category: IntegrationCategory, lastSyncAt: Date | null) {
        if (!lastSyncAt) return 'STALE';
        
        const now = new Date().getTime();
        const last = new Date(lastSyncAt).getTime();
        const diffMin = (now - last) / (1000 * 60);

        const thresholds: Record<IntegrationCategory, number> = {
            'ERP': 1440, // 24 hours
            'CRM': 60,   // 1 hour
            'OMS': 15,   // 15 minutes
            'COMMERCE': 60,
            'PAYMENT_GATEWAY': 5,
            'SHIPPING_GATEWAY': 30,
            'ANALYTICS': 1440,
            'MARKETPLACE': 60,
            'MARKETING': 1440,
            'CUSTOM_API': 15,
            'FILE_BASED': 1440,
            'WEBHOOK_SOURCE': 5
        };

        const limit = thresholds[category] || 60;
        return diffMin > limit ? 'STALE' : 'HEALTHY';
    }
}
