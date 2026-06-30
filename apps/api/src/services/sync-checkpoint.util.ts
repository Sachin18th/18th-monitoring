import { prisma } from '@kpi-platform/db';

/**
 * Incremental-sync checkpoint helpers shared by every order/customer sync service.
 *
 * The model: each sync run records the newest source `updated_at`/`date_modified` it
 * processed in `ConnectorSyncRun.checkpointValue` (stored as ISO-8601 UTC), but ONLY on a
 * fully successful run. The next run resumes from `(last successful checkpoint − overlap)`
 * so nothing slips through the boundary on partial failures, clock skew, or out-of-order
 * updates. Upserts are idempotent, so the re-fetched overlap window is harmless.
 *
 * When there is no prior successful checkpoint, `getSinceCursor` returns null and the caller
 * performs a full backfill (fetch all history, fully paginated).
 */

export type SyncProvider = 'shopify' | 'adobe_commerce' | 'bigcommerce';

// Re-fetch this much time before the last checkpoint on each incremental run.
export const SYNC_OVERLAP_MS = 60 * 60 * 1000; // 1 hour

/**
 * Resolves the incremental "since" cursor for a connector + syncType: the newest timestamp
 * from the last FULLY SUCCESSFUL run, minus the overlap buffer. Returns null when there is
 * no prior successful run (caller should then do a full backfill).
 *
 * PARTIAL/FAILED runs are intentionally ignored so their unprocessed records get retried.
 */
export async function getSinceCursor(connectorInstanceId: string, syncType: string): Promise<Date | null> {
  const lastSuccess = await prisma.connectorSyncRun.findFirst({
    where: {
      connectorInstanceId,
      syncType,
      status: 'SUCCESS',
      checkpointValue: { not: null }
    },
    orderBy: { finishedAt: 'desc' },
    select: { checkpointValue: true }
  });

  if (!lastSuccess?.checkpointValue) {
    return null;
  }

  const ts = new Date(lastSuccess.checkpointValue);
  if (Number.isNaN(ts.getTime())) {
    return null;
  }

  return new Date(ts.getTime() - SYNC_OVERLAP_MS);
}

/**
 * Parses a raw source timestamp into a Date. Shopify/BigCommerce emit ISO-8601 / RFC strings
 * with a timezone offset; Adobe Commerce emits `'YYYY-MM-DD HH:MM:SS'` in UTC (no offset), which
 * JS would otherwise parse as local time — so it is explicitly treated as UTC.
 */
export function parsePlatformDate(value: unknown, provider: SyncProvider): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized =
    provider === 'adobe_commerce' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
      ? `${raw.replace(' ', 'T')}Z`
      : raw;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Computes the new checkpoint: the maximum source timestamp across all fetched records,
 * normalized to ISO-8601 UTC for uniform on-disk storage. Returns null when no records carry
 * a usable timestamp (e.g. an empty incremental window).
 */
export function computeMaxCheckpoint(records: any[], fields: string[], provider: SyncProvider): string | null {
  let maxMs = 0;

  for (const record of records || []) {
    for (const field of fields) {
      const parsed = parsePlatformDate(record?.[field], provider);
      if (parsed && parsed.getTime() > maxMs) {
        maxMs = parsed.getTime();
      }
    }
  }

  return maxMs > 0 ? new Date(maxMs).toISOString() : null;
}

/**
 * Extracts the `rel="next"` URL from a Shopify `Link` response header for cursor-based
 * pagination. Mirrors the helper in connector-resync.service.ts.
 */
export function extractNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  const nextSegment = linkHeader.split(',').find((segment) => segment.includes('rel="next"'));
  if (!nextSegment) return null;

  const urlMatch = nextSegment.match(/<([^>]+)>/);
  return urlMatch?.[1] || null;
}

/** Formats a Date as Adobe Commerce's `'YYYY-MM-DD HH:MM:SS'` (UTC) filter value. */
export function toAdobeDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

// Resource-scoped sync types so a connector's order and customer checkpoints never collide.
export const ORDER_SYNC_TYPE = 'ORDER_RESYNC';
export const CUSTOMER_SYNC_TYPE = 'CUSTOMER_RESYNC';

// Safety cap on pagination loops; if hit, the sync logs a warning rather than silently truncating.
export const MAX_SYNC_PAGES = 200;
