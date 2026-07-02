import { Prisma } from '@prisma/client';
import { prisma } from '@kpi-platform/db';

/**
 * Reclaims orphaned sync state left behind when the API process dies mid-sync
 * (crash, deploy, or a `tsx watch` reload during development).
 *
 * A `ConnectorSyncRun` in status RUNNING — or a `ConnectorResyncJob` in
 * queued/running — is driven entirely by an in-memory task in the process that
 * created it. If that process exits, the row is never advanced to a terminal
 * state: it stays RUNNING forever. That has two nasty effects:
 *   1. The connector looks like it's "still syncing" indefinitely.
 *   2. enqueueResyncJob refuses new resyncs (409 "already active"), so the
 *      connector can never recover without manual DB surgery.
 *
 * At startup this process owns ZERO in-flight syncs by definition, so any run
 * still marked RUNNING is provably orphaned and safe to fail. (Single-instance
 * deployment assumed — if this ever runs multi-instance, gate on an age cutoff
 * instead of reaping unconditionally.)
 */
export async function reapStaleSyncRuns(): Promise<void> {
  const now = new Date();

  try {
    const [runs, jobs] = await Promise.all([
      prisma.connectorSyncRun.updateMany({
        where: { status: 'RUNNING' },
        data: {
          status: 'FAILED',
          finishedAt: now,
          errorSummary: {
            message: 'Sync run was interrupted (process restart/crash) and reclaimed on startup.',
            reclaimed: true,
            at: now.toISOString()
          } as Prisma.InputJsonValue
        }
      }),
      prisma.connectorResyncJob.updateMany({
        where: { status: { in: ['queued', 'running'] } },
        data: {
          status: 'failed',
          completedAt: now,
          error: {
            message: 'Re-sync job was interrupted (process restart/crash) and reclaimed on startup.',
            reclaimed: true,
            at: now.toISOString()
          } as Prisma.InputJsonValue
        }
      })
    ]);

    if (runs.count > 0 || jobs.count > 0) {
      console.warn('[SyncRunReaper] Reclaimed orphaned sync state on startup', {
        reclaimedRuns: runs.count,
        reclaimedResyncJobs: jobs.count
      });
    }
  } catch (err: any) {
    // Never block startup on reaper failure.
    console.error('[SyncRunReaper] Failed to reap stale sync state', { error: err?.message || err });
  }
}
