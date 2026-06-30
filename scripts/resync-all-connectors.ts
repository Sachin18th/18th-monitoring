/**
 * Scheduled re-sync for ALL connectors (Shopify, Adobe Commerce, BigCommerce).
 *
 * In the app, a re-sync only runs when a user clicks the "Re-sync" button, which
 * hits POST /integrations/:connectorInstanceId/resync and calls
 * ConnectorResyncService.enqueueResyncJob(). In production we want this to happen
 * automatically. This script enumerates every active connector and runs the SAME
 * re-sync pipeline for each, writing the same ConnectorResyncJob rows the UI reads.
 *
 * It is designed to be invoked by the OS scheduler (crontab / PM2 / systemd timer):
 *
 *   # crontab -e  (run every hour, on the hour)
 *   0 * * * * cd /var/www/html/kpi\ monitoring && /usr/bin/npx tsx scripts/resync-all-connectors.ts >> /var/log/kpi-resync.log 2>&1
 *
 * Usage:
 *   npx tsx scripts/resync-all-connectors.ts                 # orders + customers, every active connector
 *   npx tsx scripts/resync-all-connectors.ts --targets orders
 *   npx tsx scripts/resync-all-connectors.ts --provider shopify
 *   npx tsx scripts/resync-all-connectors.ts --tenant <tenantId>
 *   npx tsx scripts/resync-all-connectors.ts --include-inactive
 *
 * The script processes connectors sequentially and waits for each job to finish
 * before starting the next one, so external APIs are not hammered in parallel and
 * the process does not exit before the background sync work completes.
 */

import prisma from '../packages/db/src/prisma-client';
import { ConnectorResyncService } from '../apps/api/src/services/connector-resync.service';

const SUPPORTED_PROVIDERS = ['shopify', 'adobe_commerce', 'bigcommerce'] as const;
const ALL_TARGETS = ['orders', 'customers'] as const;

// Terminal-state polling: how long to wait for a single connector's job and how
// often to check. A full historical re-sync of a large store can take a while.
const JOB_POLL_INTERVAL_MS = 5_000;
const JOB_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes per connector

type Args = {
  targets: string[];
  provider: string | null;
  tenant: string | null;
  includeInactive: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { targets: [...ALL_TARGETS], provider: null, tenant: null, includeInactive: false };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--targets':
        args.targets = String(argv[++i] || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        break;
      case '--provider':
        args.provider = String(argv[++i] || '').trim().toLowerCase() || null;
        break;
      case '--tenant':
        args.tenant = String(argv[++i] || '').trim() || null;
        break;
      case '--include-inactive':
        args.includeInactive = true;
        break;
      default:
        console.warn(`[ResyncAll] Ignoring unknown argument: ${flag}`);
    }
  }

  if (args.targets.length === 0) args.targets = [...ALL_TARGETS];
  return args;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for a re-sync job to reach a terminal state (completed / failed), since
 * enqueueResyncJob() runs the actual sync in the background via setImmediate.
 */
async function waitForJob(input: {
  tenantId: string;
  projectId: string;
  connectorInstanceId: string;
  jobId: string;
}): Promise<'completed' | 'failed' | 'timeout'> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < JOB_TIMEOUT_MS) {
    const job = await ConnectorResyncService.getResyncJob(input);
    if (job && (job.status === 'completed' || job.status === 'failed')) {
      return job.status;
    }
    await delay(JOB_POLL_INTERVAL_MS);
  }

  return 'timeout';
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date();

  console.log('[ResyncAll] Starting scheduled re-sync', {
    at: startedAt.toISOString(),
    targets: args.targets,
    provider: args.provider || 'all',
    tenant: args.tenant || 'all',
    includeInactive: args.includeInactive
  });

  const connectors = await prisma.connectorInstance.findMany({
    where: {
      providerId: args.provider ? args.provider : { in: [...SUPPORTED_PROVIDERS] },
      ...(args.tenant ? { tenantId: args.tenant } : {}),
      // Skip drafts and disabled connectors unless explicitly asked to include them.
      ...(args.includeInactive ? {} : { lifecycleState: { in: ['ACTIVE', 'DEGRADED'] } })
    },
    select: {
      id: true,
      tenantId: true,
      siteId: true,
      providerId: true,
      label: true,
      lifecycleState: true
    },
    orderBy: { lastSyncAt: 'asc' } // re-sync the stalest connectors first
  });

  if (connectors.length === 0) {
    console.log('[ResyncAll] No matching connectors to re-sync. Done.');
    return;
  }

  console.log(`[ResyncAll] Found ${connectors.length} connector(s) to re-sync.`);

  const summary = { total: connectors.length, completed: 0, failed: 0, skipped: 0, timedOut: 0 };

  for (const connector of connectors) {
    const tag = `${connector.providerId}:${connector.label} (${connector.id})`;
    try {
      const job = await ConnectorResyncService.enqueueResyncJob({
        tenantId: connector.tenantId,
        projectId: connector.siteId,
        connectorInstanceId: connector.id,
        syncTargets: args.targets
      });

      console.log(`[ResyncAll] Enqueued ${tag} -> job ${job.jobId}. Waiting for completion...`);

      const outcome = await waitForJob({
        tenantId: connector.tenantId,
        projectId: connector.siteId,
        connectorInstanceId: connector.id,
        jobId: job.jobId
      });

      if (outcome === 'completed') {
        summary.completed++;
        console.log(`[ResyncAll] ✓ ${tag} completed.`);
      } else if (outcome === 'failed') {
        summary.failed++;
        console.warn(`[ResyncAll] ✗ ${tag} failed (see ConnectorResyncJob row for details).`);
      } else {
        summary.timedOut++;
        console.warn(`[ResyncAll] ⏱ ${tag} did not finish within ${JOB_TIMEOUT_MS / 60000} min; moving on (job keeps running).`);
      }
    } catch (err: any) {
      // 409 = a job is already running for this connector; that's fine, just skip it.
      if (err?.statusCode === 409) {
        summary.skipped++;
        console.log(`[ResyncAll] ↷ ${tag} skipped (a re-sync is already running).`);
      } else {
        summary.failed++;
        console.error(`[ResyncAll] ✗ ${tag} errored while enqueueing:`, err?.message || err);
      }
    }
  }

  const durationMs = Date.now() - startedAt.getTime();
  console.log('[ResyncAll] Finished scheduled re-sync', {
    ...summary,
    durationSec: Math.round(durationMs / 1000)
  });
}

run()
  .catch((err) => {
    console.error('[ResyncAll] Fatal error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode || 0);
  });
