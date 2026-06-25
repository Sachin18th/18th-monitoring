import { prisma } from '@kpi-platform/db';

/**
 * Backend / System Health — our OWN platform's health, distinct from
 * StoreHealthService (which probes external merchant store APIs).
 *
 * Answers four questions, all from process state + cheap DB reads:
 *   - api      — is this API process up (uptime/memory)
 *   - database — is Postgres reachable and how slow (timed SELECT 1)
 *   - syncJobs — connectors that haven't synced recently or whose last run failed
 *   - dlq      — dead-letter queue backlog depth
 *
 * Computed live on each request (no persisted history table). Each sub-check is
 * wrapped so a single failure degrades that one signal rather than failing the
 * whole snapshot.
 */

export type HealthStatus = 'healthy' | 'warning' | 'degraded' | 'critical';

// A connector that hasn't synced within this window is considered stale.
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 60 min
// DB latency above this is a warning signal.
const DB_LATENCY_WARN_MS = 500;
// DLQ depth at/above this flips the signal to critical.
const DLQ_CRITICAL_DEPTH = 25;

const FAILED_RUN_STATUSES = new Set(['FAILED', 'DEAD_LETTERED']);

export interface BackendHealthSnapshot {
  overall: HealthStatus;
  computedAt: string;
  api: {
    status: 'up';
    uptimeSeconds: number;
    memoryMb: number;
  };
  database: {
    status: HealthStatus;
    reachable: boolean;
    latencyMs: number | null;
  };
  syncJobs: {
    status: HealthStatus;
    total: number;
    stale: number;
    failed: number;
    connectors: Array<{
      id: string;
      label: string;
      provider: string;
      lastSyncAt: string | null;
      minsSinceSync: number | null;
      lastRunStatus: string | null;
      state: HealthStatus;
    }>;
  };
  dlq: {
    status: HealthStatus;
    depth: number;
    unreviewed: number;
  };
}

export class BackendHealthService {
  static async snapshot(siteId: string): Promise<BackendHealthSnapshot> {
    const [database, syncJobs, dlq] = await Promise.all([
      this.checkDatabase(),
      this.checkSyncJobs(siteId),
      this.checkDlq(siteId),
    ]);

    const api = this.checkApi();

    const overall = this.worst([database.status, syncJobs.status, dlq.status]);

    return {
      overall,
      computedAt: new Date().toISOString(),
      api,
      database,
      syncJobs,
      dlq,
    };
  }

  private static checkApi(): BackendHealthSnapshot['api'] {
    const mem = process.memoryUsage();
    return {
      status: 'up',
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
    };
  }

  private static async checkDatabase(): Promise<BackendHealthSnapshot['database']> {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;
      return {
        status: latencyMs > DB_LATENCY_WARN_MS ? 'warning' : 'healthy',
        reachable: true,
        latencyMs,
      };
    } catch (err) {
      console.error('[BackendHealth] database check failed', err);
      return { status: 'critical', reachable: false, latencyMs: null };
    }
  }

  private static async checkSyncJobs(siteId: string): Promise<BackendHealthSnapshot['syncJobs']> {
    try {
      const connectors = await prisma.connectorInstance.findMany({
        where: { siteId },
        select: { id: true, label: true, providerId: true, lastSyncAt: true },
      });

      // Latest run status per connector — pull recent runs newest-first and keep
      // the first one seen for each connector (avoids an N+1 per connector).
      const ids = connectors.map((c: any) => c.id);
      const lastRunByConnector = new Map<string, string>();
      if (ids.length) {
        const runs = await prisma.connectorSyncRun.findMany({
          where: { connectorInstanceId: { in: ids } },
          orderBy: { startedAt: 'desc' },
          take: 200,
          select: { connectorInstanceId: true, status: true },
        });
        for (const run of runs as any[]) {
          if (!lastRunByConnector.has(run.connectorInstanceId)) {
            lastRunByConnector.set(run.connectorInstanceId, run.status);
          }
        }
      }

      const now = Date.now();
      let stale = 0;
      let failed = 0;

      const detailed = connectors.map((c: any) => {
        const lastSyncMs = c.lastSyncAt ? new Date(c.lastSyncAt).getTime() : null;
        const minsSinceSync = lastSyncMs === null ? null : Math.round((now - lastSyncMs) / 60000);
        const isStale = lastSyncMs === null || now - lastSyncMs > STALE_THRESHOLD_MS;
        const lastRunStatus = lastRunByConnector.get(c.id) || null;
        const isFailed = lastRunStatus ? FAILED_RUN_STATUSES.has(String(lastRunStatus).toUpperCase()) : false;

        if (isStale) stale += 1;
        if (isFailed) failed += 1;

        const state: HealthStatus = isFailed ? 'critical' : isStale ? 'warning' : 'healthy';

        return {
          id: c.id,
          label: c.label || c.providerId || 'Connector',
          provider: c.providerId,
          lastSyncAt: c.lastSyncAt ? new Date(c.lastSyncAt).toISOString() : null,
          minsSinceSync,
          lastRunStatus,
          state,
        };
      });

      const status: HealthStatus = failed > 0 ? 'critical' : stale > 0 ? 'warning' : 'healthy';

      return { status, total: connectors.length, stale, failed, connectors: detailed };
    } catch (err) {
      console.error('[BackendHealth] sync-jobs check failed', err);
      return { status: 'degraded', total: 0, stale: 0, failed: 0, connectors: [] };
    }
  }

  private static async checkDlq(siteId: string): Promise<BackendHealthSnapshot['dlq']> {
    try {
      const [depth, unreviewed] = await Promise.all([
        prisma.deadLetterQueue.count({ where: { siteId } }),
        prisma.deadLetterQueue.count({ where: { siteId, actionTaken: null } }),
      ]);
      const status: HealthStatus =
        depth >= DLQ_CRITICAL_DEPTH ? 'critical' : depth > 0 ? 'warning' : 'healthy';
      return { status, depth, unreviewed };
    } catch (err) {
      console.error('[BackendHealth] dlq check failed', err);
      return { status: 'degraded', depth: 0, unreviewed: 0 };
    }
  }

  private static worst(statuses: HealthStatus[]): HealthStatus {
    const rank: Record<HealthStatus, number> = { healthy: 0, warning: 1, degraded: 2, critical: 3 };
    return statuses.reduce<HealthStatus>(
      (acc, s) => (rank[s] > rank[acc] ? s : acc),
      'healthy'
    );
  }
}

export default BackendHealthService;
