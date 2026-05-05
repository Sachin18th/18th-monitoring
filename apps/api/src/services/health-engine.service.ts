import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import crypto from 'crypto';

export type HealthStatus = 'healthy' | 'warning' | 'degraded' | 'critical' | 'failed';

export interface HealthSignal {
    layer: 'connector' | 'pipeline' | 'freshness' | 'kpi' | 'system';
    name: string;
    status: HealthStatus;
    weight: number;  // 1-10
    detail?: string;
}

export interface HealthSnapshot {
    id: string;
    tenantId: string;
    siteId: string;
    healthScore: number;  // 0-100
    status: HealthStatus;
    signals: HealthSignal[];
    computedAt: string;
}

export class HealthEngine {

    private static readonly STATUS_SCORES: Record<HealthStatus, number> = {
        healthy: 100,
        warning: 70,
        degraded: 45,
        critical: 20,
        failed: 0
    };

    /**
     * Evaluates health for a given project by aggregating signals from all layers.
     */
    public static evaluate(siteId: string, tenantId: string): HealthSnapshot {
        const signals: HealthSignal[] = [];

        // ── Layer 1: Connector Health ─────────────────────────────────────
        const integrations = GlobalMemoryStore.projectIntegrations.get(siteId) || [];
        const activeIntegrations = integrations.filter((i: any) => i.status === 'ACTIVE' || i.status === 'Active');
        const degradedIntegrations = integrations.filter((i: any) => i.status === 'DEGRADED' || i.healthStatus === 'DEGRADED');
        
        if (integrations.length > 0) {
            const connectorStatus: HealthStatus = 
                degradedIntegrations.length === 0 ? 'healthy' :
                degradedIntegrations.length / integrations.length > 0.5 ? 'critical' : 'warning';
            
            signals.push({
                layer: 'connector',
                name: 'Integration Health',
                status: connectorStatus,
                weight: 8,
                detail: `${activeIntegrations.length}/${integrations.length} integrations healthy`
            });
        }

        // ── Layer 2: Pipeline Health ──────────────────────────────────────
        const recentJobs = GlobalMemoryStore.pipelineJobs.filter((j: any) => j.siteId === siteId);
        const failedJobs = recentJobs.filter((j: any) => j.status === 'DEAD_LETTERED' || j.status === 'FAILED');
        const dlqItems = GlobalMemoryStore.deadLetterQueue.filter((d: any) => d.siteId === siteId && !d.actionTaken);
        
        if (recentJobs.length > 0) {
            const failureRate = failedJobs.length / recentJobs.length;
            const pipelineStatus: HealthStatus =
                dlqItems.length > 5 ? 'critical' :
                failureRate > 0.5 ? 'degraded' :
                failureRate > 0.2 ? 'warning' : 'healthy';

            signals.push({
                layer: 'pipeline',
                name: 'Pipeline Jobs',
                status: pipelineStatus,
                weight: 7,
                detail: `${failedJobs.length} failures, ${dlqItems.length} in DLQ`
            });
        }

        // ── Layer 3: Data Freshness ───────────────────────────────────────
        const syncHistory = GlobalMemoryStore.syncHistory.filter((e: any) => e.projectId === siteId);
        const latestSync = syncHistory.sort((a: any, b: any) => new Date(b.receivedAt ?? b.createdAt).getTime() - new Date(a.receivedAt ?? a.createdAt).getTime())[0];
        
        if (latestSync) {
            const lagMinutes = (Date.now() - new Date(latestSync.receivedAt ?? latestSync.createdAt).getTime()) / 60000;
            const freshnessStatus: HealthStatus =
                lagMinutes > 60 ? 'critical' :
                lagMinutes > 30 ? 'degraded' :
                lagMinutes > 10 ? 'warning' : 'healthy';

            signals.push({
                layer: 'freshness',
                name: 'Data Freshness',
                status: freshnessStatus,
                weight: 6,
                detail: `Last ingest ${Math.round(lagMinutes)}m ago`
            });
        } else {
            signals.push({
                layer: 'freshness',
                name: 'Data Freshness',
                status: 'warning',
                weight: 6,
                detail: 'No ingestion events recorded yet'
            });
        }

        // ── Layer 4: KPI Health ───────────────────────────────────────────
        const kpiMetrics = GlobalMemoryStore.metrics.filter((m: any) => m.siteId === siteId && m.freshnessStatus);
        const staleKpis = kpiMetrics.filter((m: any) => m.freshnessStatus === 'stale');

        if (kpiMetrics.length > 0) {
            const kpiStatus: HealthStatus =
                staleKpis.length === kpiMetrics.length ? 'degraded' :
                staleKpis.length > 0 ? 'warning' : 'healthy';

            signals.push({
                layer: 'kpi',
                name: 'KPI Freshness',
                status: kpiStatus,
                weight: 5,
                detail: `${staleKpis.length} stale KPIs`
            });
        }

        // ── Score Computation ─────────────────────────────────────────────
        const healthScore = this.computeWeightedScore(signals);
        const overallStatus = this.scoreToStatus(healthScore);

        const snapshot: HealthSnapshot = {
            id: crypto.randomUUID(),
            tenantId,
            siteId,
            healthScore,
            status: overallStatus,
            signals,
            computedAt: new Date().toISOString()
        };

        // Persist snapshot for trend history
        GlobalMemoryStore.healthSnapshots = GlobalMemoryStore.healthSnapshots || [];
        GlobalMemoryStore.healthSnapshots.push(snapshot);

        return snapshot;
    }

    private static computeWeightedScore(signals: HealthSignal[]): number {
        if (signals.length === 0) return 100;
        
        let totalWeight = 0;
        let weightedScore = 0;
        
        for (const signal of signals) {
            const score = this.STATUS_SCORES[signal.status];
            weightedScore += score * signal.weight;
            totalWeight += signal.weight;
        }

        return Math.round(weightedScore / totalWeight);
    }

    private static scoreToStatus(score: number): HealthStatus {
        if (score >= 90) return 'healthy';
        if (score >= 70) return 'warning';
        if (score >= 45) return 'degraded';
        if (score >= 20) return 'critical';
        return 'failed';
    }
}
