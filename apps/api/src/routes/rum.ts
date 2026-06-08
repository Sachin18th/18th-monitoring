import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';
import { StorefrontErrorService } from '../services/storefront-error.service';
import { rateLimiter } from '../middlewares/rate-limiter.middleware';
import { ResponseUtil } from '../utils/response';

/**
 * Public, no-auth RUM endpoints (mounted at /api/rum):
 *   POST /errors   — storefront batch ingest (projectId + connectorId via query)
 *   GET  /errors   — dashboard query (summary + paginated rows)
 *   GET  /rum.js   — the self-contained storefront capture script
 *
 * No bearer/api-key auth by design: the ingest must run on a public storefront.
 * A coarse per-IP rate limit + a per-session limit (in the service) guard abuse.
 */
export const rumRoutes = async (fastify: FastifyInstance) => {
  // Coarse per-IP backstop (the real limit is per session_id, in the service).
  fastify.addHook('onRequest', rateLimiter(300, 60_000));

  // ── Ingest ──────────────────────────────────────────────────────────────
  fastify.post('/errors', async (req, reply) => {
    const { projectId, connectorId } = (req.query as any) || {};
    const body = (req.body as any) || {};
    const errors = Array.isArray(body.errors) ? body.errors : [];

    if (!projectId) {
      return reply.code(400).send(ResponseUtil.error('Missing projectId', 'MISSING_PROJECT_ID', null, req.id as string));
    }

    try {
      const result = await StorefrontErrorService.ingestBatch(String(projectId), connectorId ? String(connectorId) : null, errors);
      return reply.code(200).send(result); // { accepted, rejected } — beacon ignores the body
    } catch (err) {
      console.error('[RUM] ingest failed', err);
      // Never surface internals to a public endpoint; report nothing accepted.
      return reply.code(200).send({ accepted: 0, rejected: errors.length });
    }
  });

  // ── Query (dashboard) ───────────────────────────────────────────────────
  fastify.get('/errors', async (req, reply) => {
    const q = (req.query as any) || {};
    if (!q.projectId) {
      return reply.code(400).send(ResponseUtil.error('Missing projectId', 'MISSING_PROJECT_ID', null, req.id as string));
    }
    try {
      const data = await StorefrontErrorService.query({
        projectId: String(q.projectId),
        connectorId: q.connectorId ? String(q.connectorId) : null,
        type: q.type ? String(q.type) : null,
        page: q.page ? String(q.page) : null,
        from: q.from ? String(q.from) : null,
        to: q.to ? String(q.to) : null,
        limit: q.limit ? Number(q.limit) : null,
        offset: q.offset ? Number(q.offset) : null,
      });
      return reply.code(200).send(ResponseUtil.success(data, {}, req.id as string));
    } catch (err) {
      console.error('[RUM] query failed', err);
      const message = err instanceof Error ? err.message : 'Failed to query storefront errors';
      return reply.code(500).send(ResponseUtil.error(message, 'RUM_QUERY_FAILED', null, req.id as string));
    }
  });

  // ── Storefront capture script (CDN-servable) ──────────────────────────────
  let cachedScript: string | null = null;
  fastify.get('/rum.js', async (_req, reply) => {
    if (cachedScript === null) {
      try {
        cachedScript = readFileSync(join(__dirname, '../public/rum.js'), 'utf8');
      } catch (err) {
        console.error('[RUM] failed to read rum.js', err);
        cachedScript = '/* rum.js unavailable */';
      }
    }
    reply
      .header('Content-Type', 'application/javascript; charset=utf-8')
      .header('Cache-Control', 'public, max-age=3600')
      .send(cachedScript);
  });
};
