/**
 * In-memory sliding-window rate limit for the public storefront tracking ingest
 * (POST /api/track). Caps accepted events at 1,000 per rolling 60s window, per
 * connector_instance_id.
 *
 * Matches the existing in-memory limiter pattern (rate-limiter.middleware.ts,
 * rum-rate-limit.ts) — no Redis in this project yet. A batch is admitted up to
 * the remaining budget; the overflow is rejected (the caller counts it).
 *
 * PRODUCTION NOTE: replace with a Redis-backed window for multi-instance
 * deployments where API replicas must share the counter.
 */

const WINDOW_MS = 60_000;
const MAX_EVENTS_PER_WINDOW = 1_000;

// connector_instance_id -> ascending list of accepted-event timestamps (ms).
const buckets = new Map<string, number[]>();

function prune(times: number[], now: number): void {
  const cutoff = now - WINDOW_MS;
  // Timestamps are pushed in arrival order, so they stay ascending — drop the
  // expired prefix in one splice.
  let expired = 0;
  while (expired < times.length && times[expired] <= cutoff) expired += 1;
  if (expired > 0) times.splice(0, expired);
}

/**
 * Reserve capacity for `requested` events from this connector's window.
 * Returns how many were admitted (0..requested). Side-effect: records the
 * admitted events against the window.
 */
export function reserveTrackingBudget(connectorInstanceId: string, requested: number): number {
  if (requested <= 0) return 0;

  const now = Date.now();
  let times = buckets.get(connectorInstanceId);
  if (!times) {
    times = [];
    buckets.set(connectorInstanceId, times);
  }

  prune(times, now);

  const available = Math.max(0, MAX_EVENTS_PER_WINDOW - times.length);
  const accepted = Math.min(requested, available);
  for (let i = 0; i < accepted; i += 1) times.push(now);
  return accepted;
}

// Periodic cleanup so the map doesn't grow unbounded in a long-running process.
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of buckets) {
    prune(times, now);
    if (times.length === 0) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref?.();
