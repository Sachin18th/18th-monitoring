import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeRole } from '../../../../packages/shared-types/src';
import { tenantAuthHandler } from '../middlewares/auth.middleware';
import { roleGuard } from '../middlewares/rbac.middleware';
import { rateLimiter } from '../middlewares/rate-limiter.middleware';
import { ResponseUtil } from '../utils/response';
import { StorefrontTrackingService } from '../services/storefront-tracking.service';
import { StorefrontScriptInstallService } from '../services/storefront-script-install.service';

/**
 * Storefront session/event tracking (mounted at /api/track):
 *
 *   POST /            — public, no auth. Validates the connector by lookup,
 *                       rate-limits at 1,000 events/min per connector, upserts
 *                       the session(s) and bulk-inserts events. Never 500s.
 *   GET  /sessions    — analyst+ . Scoped by connector_instance_id + tenant_id.
 *   GET  /events      — analyst+ . Same scoping.
 *   GET  /funnel      — analyst+ . Checkout funnel + abandonment rate.
 *
 * The ingest is public by design (must run on a third-party storefront). A
 * coarse per-IP backstop plus the per-connector sliding window guard abuse.
 */

/**
 * "Analyst role minimum" guard. analyst is the lowest tier in
 * packages/shared-types/src/permissions.ts, so any role that normalizes to a
 * recognized AppRole (analyst | ops_lead | admin | super_admin) is admitted.
 */
const analystMinimumGuard = async (req: any, reply: any) => {
  const role = normalizeRole(req.user?.role);
  if (!role) {
    return reply
      .code(403)
      .send(ResponseUtil.error('This action requires at least analyst permissions.', 'FORBIDDEN'));
  }
};

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * The public API host the tracker is served from / posts to. Resolution order:
 *   1. explicit ingest_base_url in the request,
 *   2. PUBLIC_BASE_URL env (the configured public/tunnel host — preferred so
 *      generated snippets never point at localhost),
 *   3. the request's forwarded host (last resort).
 */
function resolveHost(req: any, src: any): string {
  const explicit = src?.ingest_base_url || src?.ingestBaseUrl;
  if (explicit) return String(explicit).replace(/\/+$/, '');

  const configured = process.env.PUBLIC_BASE_URL || process.env.TRACKER_PUBLIC_BASE_URL;
  if (configured) return String(configured).replace(/\/+$/, '');

  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  return host ? `${proto}://${String(host).split(',')[0].trim()}` : '';
}

function installHttpCode(status: string): number {
  if (status === 'not_found') return 404;
  if (status === 'error') return 502; // upstream platform API failure
  return 200; // installed | already_installed | manual_required
}

export const trackRoutes = async (fastify: FastifyInstance) => {
  // ── Storefront capture script (CDN-servable) ──────────────────────────────
  let cachedScript: string | null = null;
  fastify.get('/tracker.js', async (_req, reply) => {
    if (cachedScript === null) {
      try {
        cachedScript = readFileSync(join(__dirname, '../public/tracker.js'), 'utf8');
      } catch (err) {
        console.error('[TRACK] failed to read tracker.js', err);
        cachedScript = '/* tracker.js unavailable */';
      }
    }
    reply
      .header('Content-Type', 'application/javascript; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .send(cachedScript);
  });

  // ── Public ingest ─────────────────────────────────────────────────────────
  // Coarse per-IP backstop; the real limit is per connector_instance_id.
  fastify.post('/', { preHandler: [rateLimiter(600, 60_000)] }, async (req, reply) => {
    const body = (req.body as any) || {};
    const query = (req.query as any) || {};

    const connectorInstanceId =
      body.connector_instance_id ||
      body.connectorInstanceId ||
      query.connector_instance_id ||
      query.connectorInstanceId ||
      query.connectorId ||
      null;

    const events = Array.isArray(body.events)
      ? body.events
      : Array.isArray(body.batch)
        ? body.batch
        : [];

    // Live visibility: log every incoming hit (connector, count, types, IP).
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req as any).ip || '?';
    const types = events.map((e: any) => e?.event_type || e?.eventType).filter(Boolean);
    console.log('[TRACK] ingest:hit', {
      connectorInstanceId: connectorInstanceId ? String(connectorInstanceId) : null,
      count: events.length,
      types,
      ip,
    });

    try {
      const result = await StorefrontTrackingService.ingestBatch({
        connectorInstanceId: connectorInstanceId ? String(connectorInstanceId) : null,
        events,
        userAgent: (req.headers['user-agent'] as string) || null,
        deviceType: body.device_type || body.deviceType || null,
      });
      console.log('[TRACK] ingest:result', {
        connectorInstanceId: connectorInstanceId ? String(connectorInstanceId) : null,
        accepted: result.accepted,
        rejected: result.rejected,
        stored: result.stored,
      });
      // Beacon ignores the body; report counts for fetch-based callers.
      // `accepted` = events folded into sessions; `stored` = milestone rows written.
      return reply.code(200).send({ received: result.accepted, accepted: result.accepted, rejected: result.rejected, stored: result.stored });
    } catch (err) {
      // Never surface internals from a public endpoint, and never 500.
      console.error('[TRACK] ingest route failed', err);
      return reply.code(200).send({ accepted: 0, rejected: Array.isArray(events) ? events.length : 0 });
    }
  });

  // ── Analyst queries ─────────────────────────────────────────────────────
  const authed = { preHandler: [tenantAuthHandler, analystMinimumGuard] };

  fastify.get('/sessions', authed, async (req, reply) => {
    const q = (req.query as any) || {};
    const connectorInstanceId = q.connector_instance_id || q.connectorInstanceId || q.connectorId;
    if (!connectorInstanceId) {
      return reply
        .code(400)
        .send(ResponseUtil.error('connector_instance_id query parameter is required', 'MISSING_CONNECTOR_ID'));
    }
    try {
      const data = await StorefrontTrackingService.listSessions({
        tenantId: String((req as any).tenantId ?? req.user.tenantId),
        connectorInstanceId: String(connectorInstanceId),
        from: parseDate(q.from),
        to: parseDate(q.to),
        limit: q.limit ? Number(q.limit) : null,
        offset: q.offset ? Number(q.offset) : null,
      });
      return reply.code(200).send(ResponseUtil.success(data, {}, req.id as string));
    } catch (err) {
      console.error('[TRACK] sessions query failed', err);
      return reply.code(500).send(ResponseUtil.error('Failed to query sessions', 'TRACK_SESSIONS_FAILED'));
    }
  });

  fastify.get('/events', authed, async (req, reply) => {
    const q = (req.query as any) || {};
    const connectorInstanceId = q.connector_instance_id || q.connectorInstanceId || q.connectorId;
    if (!connectorInstanceId) {
      return reply
        .code(400)
        .send(ResponseUtil.error('connector_instance_id query parameter is required', 'MISSING_CONNECTOR_ID'));
    }
    try {
      const data = await StorefrontTrackingService.listEvents({
        tenantId: String((req as any).tenantId ?? req.user.tenantId),
        connectorInstanceId: String(connectorInstanceId),
        sessionId: q.session_id || q.sessionId || null,
        eventType: q.event_type || q.eventType || null,
        from: parseDate(q.from),
        to: parseDate(q.to),
        limit: q.limit ? Number(q.limit) : null,
        offset: q.offset ? Number(q.offset) : null,
      });
      return reply.code(200).send(ResponseUtil.success(data, {}, req.id as string));
    } catch (err) {
      console.error('[TRACK] events query failed', err);
      return reply.code(500).send(ResponseUtil.error('Failed to query events', 'TRACK_EVENTS_FAILED'));
    }
  });

  fastify.get('/funnel', authed, async (req, reply) => {
    const q = (req.query as any) || {};
    const connectorInstanceId = q.connector_instance_id || q.connectorInstanceId || q.connectorId;
    if (!connectorInstanceId) {
      return reply
        .code(400)
        .send(ResponseUtil.error('connector_instance_id query parameter is required', 'MISSING_CONNECTOR_ID'));
    }
    try {
      const data = await StorefrontTrackingService.funnel({
        tenantId: String((req as any).tenantId ?? req.user.tenantId),
        connectorInstanceId: String(connectorInstanceId),
        from: parseDate(q.from),
        to: parseDate(q.to),
      });
      return reply.code(200).send(ResponseUtil.success(data, {}, req.id as string));
    } catch (err) {
      console.error('[TRACK] funnel query failed', err);
      return reply.code(500).send(ResponseUtil.error('Failed to compute funnel', 'TRACK_FUNNEL_FAILED'));
    }
  });

  // Session-derived KPIs (conversion, abandonment, engagement, platform split).
  fastify.get('/kpis', authed, async (req, reply) => {
    const q = (req.query as any) || {};
    const connectorInstanceId = q.connector_instance_id || q.connectorInstanceId || q.connectorId;
    if (!connectorInstanceId) {
      return reply
        .code(400)
        .send(ResponseUtil.error('connector_instance_id query parameter is required', 'MISSING_CONNECTOR_ID'));
    }
    try {
      const data = await StorefrontTrackingService.sessionKpis({
        tenantId: String((req as any).tenantId ?? req.user.tenantId),
        connectorInstanceId: String(connectorInstanceId),
        from: parseDate(q.from),
        to: parseDate(q.to),
      });
      return reply.code(200).send(ResponseUtil.success(data, {}, req.id as string));
    } catch (err) {
      console.error('[TRACK] kpis query failed', err);
      return reply.code(500).send(ResponseUtil.error('Failed to compute KPIs', 'TRACK_KPIS_FAILED'));
    }
  });

  // ── Programmatic install via stored platform admin token ──────────────────
  // Admin only (manages connectors); tenant-scoped — the service only acts on a
  // connector belonging to req.user.tenantId.
  const adminGuard = { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'PROJECT_ADMIN', 'SUPER_ADMIN'])] };

  const connectorIdFrom = (src: any): string | null =>
    src?.connector_instance_id || src?.connectorInstanceId || src?.connectorId || null;

  fastify.post('/install', adminGuard, async (req, reply) => {
    const body = (req.body as any) || {};
    const connectorInstanceId = connectorIdFrom(body);
    if (!connectorInstanceId) {
      return reply.code(400).send(ResponseUtil.error('connector_instance_id is required', 'MISSING_CONNECTOR_ID'));
    }
    const host = resolveHost(req, body);
    if (!host) {
      return reply.code(400).send(ResponseUtil.error('ingest_base_url is required (public API host)', 'MISSING_INGEST_URL'));
    }
    try {
      const tenantId = String((req as any).tenantId ?? req.user.tenantId);
      const result = await StorefrontScriptInstallService.install(String(connectorInstanceId), tenantId, host);
      return reply.code(installHttpCode(result.status)).send(ResponseUtil.success(result, {}, req.id as string));
    } catch (err) {
      console.error('[TRACK] install failed', err);
      return reply.code(500).send(ResponseUtil.error('Install failed', 'TRACK_INSTALL_FAILED'));
    }
  });

  fastify.get('/install/status', adminGuard, async (req, reply) => {
    const q = (req.query as any) || {};
    const connectorInstanceId = connectorIdFrom(q);
    if (!connectorInstanceId) {
      return reply.code(400).send(ResponseUtil.error('connector_instance_id is required', 'MISSING_CONNECTOR_ID'));
    }
    try {
      const tenantId = String((req as any).tenantId ?? req.user.tenantId);
      const result = await StorefrontScriptInstallService.status(String(connectorInstanceId), tenantId);
      return reply.code(installHttpCode(result.status)).send(ResponseUtil.success(result, {}, req.id as string));
    } catch (err) {
      console.error('[TRACK] install status failed', err);
      return reply.code(500).send(ResponseUtil.error('Install status check failed', 'TRACK_INSTALL_STATUS_FAILED'));
    }
  });

  fastify.delete('/install', adminGuard, async (req, reply) => {
    const src = { ...((req.query as any) || {}), ...((req.body as any) || {}) };
    const connectorInstanceId = connectorIdFrom(src);
    if (!connectorInstanceId) {
      return reply.code(400).send(ResponseUtil.error('connector_instance_id is required', 'MISSING_CONNECTOR_ID'));
    }
    try {
      const tenantId = String((req as any).tenantId ?? req.user.tenantId);
      const result = await StorefrontScriptInstallService.uninstall(String(connectorInstanceId), tenantId);
      return reply.code(installHttpCode(result.status)).send(ResponseUtil.success(result, {}, req.id as string));
    } catch (err) {
      console.error('[TRACK] uninstall failed', err);
      return reply.code(500).send(ResponseUtil.error('Uninstall failed', 'TRACK_UNINSTALL_FAILED'));
    }
  });
};

export default trackRoutes;
