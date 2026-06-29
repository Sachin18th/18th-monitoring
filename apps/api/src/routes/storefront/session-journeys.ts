import { FastifyInstance } from 'fastify';
import { prisma } from '@kpi-platform/db';
import { tenantAuthHandler } from '../../middlewares/auth.middleware';
import { successResponse, errorResponse } from '../../utils/response';

/**
 * Session Journey Timeline routes — individual visitor paths through the
 * storefront, reconstructed event-by-event from storefront_sessions /
 * storefront_events.
 *
 * Auth: tenantAuthHandler attaches req.tenantId + req.user. We additionally
 * verify the requested connectorInstanceId belongs to this tenant AND project
 * (siteId === projectId) before reading any rows, so a session token cannot be
 * used to read another tenant's / project's sessions.
 *
 * Tables are read-only here and have no Prisma models, so all reads use raw SQL
 * via $queryRaw (parameterized).
 */
export const sessionJourneyRoutes = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', tenantAuthHandler);

    // Resolves + authorizes the connector instance for the current request.
    // Returns the connectorInstanceId on success, or null after replying 4xx.
    const authorizeConnector = async (
        req: any,
        reply: any,
        projectId: string | undefined,
        connectorInstanceId: string | undefined
    ): Promise<string | null> => {
        if (!projectId) {
            reply.code(400).send(errorResponse('projectId is required', 'BAD_REQUEST'));
            return null;
        }
        if (!connectorInstanceId) {
            reply.code(400).send(errorResponse('connectorInstanceId is required', 'BAD_REQUEST'));
            return null;
        }

        const connector = await prisma.connectorInstance.findFirst({
            where: { id: connectorInstanceId, tenantId: req.tenantId, siteId: projectId },
            select: { id: true }
        });
        if (!connector) {
            reply.code(403).send(errorResponse('Unauthorized connector for this project', 'FORBIDDEN'));
            return null;
        }
        return connector.id;
    };

    /**
     * GET /api/storefront/session-journeys
     * Query: projectId (required), connectorInstanceId (required), limit (default 50)
     * Returns the most recent sessions for the connector, newest first.
     */
    fastify.get('/session-journeys', async (req: any, reply: any) => {
        const { projectId, connectorInstanceId } = req.query || {};
        const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
        if (!connectorId) return;

        const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

        try {
            const rows = await prisma.$queryRaw<any[]>`
                SELECT
                    s.id,
                    s.session_id,
                    s.visitor_id,
                    s.started_at,
                    s.last_active_at,
                    s.device_type,
                    s.landing_page,
                    s.referrer,
                    s.page_view_count,
                    s.funnel_stages_reached,
                    s.purchase_completed,
                    s.checkout_started,
                    s.funnel_stage
                FROM storefront_sessions s
                WHERE s.connector_instance_id = ${connectorId}
                  AND s.tenant_id = ${req.tenantId}
                ORDER BY s.started_at DESC
                LIMIT ${limit}
            `;

            const sessions = rows.map((r) => ({
                id: r.id,
                session_id: r.session_id,
                visitor_id: r.visitor_id,
                started_at: r.started_at instanceof Date ? r.started_at.toISOString() : r.started_at,
                last_active_at: r.last_active_at instanceof Date ? r.last_active_at.toISOString() : r.last_active_at,
                device_type: r.device_type,
                landing_page: r.landing_page,
                referrer: r.referrer,
                page_view_count: Number(r.page_view_count ?? 0),
                // funnel_stages_reached is JSONB — Prisma returns it already parsed.
                funnel_stages_reached: Array.isArray(r.funnel_stages_reached) ? r.funnel_stages_reached : [],
                purchase_completed: Boolean(r.purchase_completed),
                checkout_started: Boolean(r.checkout_started),
                funnel_stage: r.funnel_stage
            }));

            return reply.code(200).send(successResponse({ sessions }));
        } catch (err: any) {
            req.log?.error?.({ err }, '[session-journeys] list failed');
            return reply.code(500).send(errorResponse('Failed to load session journeys', 'INTERNAL_SERVER_ERROR'));
        }
    });

    /**
     * GET /api/storefront/session-journey-events
     * Query: sessionId (required), connectorInstanceId (required), projectId (required)
     * Returns the full ordered event path for a single session.
     */
    fastify.get('/session-journey-events', async (req: any, reply: any) => {
        const { projectId, connectorInstanceId, sessionId } = req.query || {};
        const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
        if (!connectorId) return;

        if (!sessionId) {
            return reply.code(400).send(errorResponse('sessionId is required', 'BAD_REQUEST'));
        }

        try {
            const rows = await prisma.$queryRaw<any[]>`
                SELECT
                    id,
                    event_type,
                    page_url,
                    page_title,
                    occurred_at,
                    canonical_stage
                FROM storefront_events
                WHERE session_id = ${String(sessionId)}
                  AND connector_instance_id = ${connectorId}
                  AND tenant_id = ${req.tenantId}
                ORDER BY occurred_at ASC
            `;

            const events = rows.map((r) => ({
                id: r.id,
                event_type: r.event_type,
                page_url: r.page_url,
                page_title: r.page_title,
                occurred_at: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : r.occurred_at,
                canonical_stage: r.canonical_stage
            }));

            return reply.code(200).send(successResponse({ events }));
        } catch (err: any) {
            req.log?.error?.({ err }, '[session-journeys] events failed');
            return reply.code(500).send(errorResponse('Failed to load session events', 'INTERNAL_SERVER_ERROR'));
        }
    });
};