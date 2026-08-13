import { FastifyInstance } from 'fastify';
import { Prisma } from '.prisma/tenant-client';
import { prisma, decryptEmail } from '@kpi-platform/db';
import { tenantAuthHandler } from '../../middlewares/auth.middleware';
import { successResponse, errorResponse } from '../../utils/response';
import { getDataPlaneClient } from '../../lib/tenant-prisma';

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

    // The externalIds key under which each platform's numeric customer id is
    // synced into customer_profiles (see *-customer-sync.service.ts). Used to
    // resolve a tracker-captured customer_id back to a name/email.
    const externalIdKeyForProvider = (providerId?: string | null): string | null => {
        const p = String(providerId || '').toLowerCase();
        if (p.includes('shopify')) return 'shopify';
        if (p.includes('bigcommerce')) return 'bigcommerce';
        if (p.includes('adobe') || p.includes('magento')) return 'adobe_commerce';
        return null;
    };

    // Best-effort display name from a synced customer_profiles.metadata blob.
    const nameFromMetadata = (metadata: any): string | null => {
        if (!metadata || typeof metadata !== 'object') return null;
        const parts = [metadata.firstName, metadata.lastName].filter(Boolean).map(String);
        const name = parts.join(' ').trim();
        return name || null;
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

        // Optional acquisition-channel filter (pills). 'all'/absent → no filter.
        const CHANNELS = new Set(['google', 'meta', 'organic', 'direct', 'other']);
        const channelParam = String(req.query.channel || '').toLowerCase();
        const channelFilter = CHANNELS.has(channelParam)
            ? Prisma.sql`AND s.channel = ${channelParam}`
            : Prisma.empty;

        try {
            const db = await getDataPlaneClient(connectorId);
            // Platform key for resolving a tracker-captured numeric customer_id
            // back to a synced customer_profiles row (name/email). Shopify only
            // exposes the numeric id client-side on normal pages, so this join is
            // the sole way its sessions get a name/email — unlike Adobe/BigCommerce
            // where the tracker can read name/email directly from the storefront.
            const connectorMeta = await prisma.connectorInstance.findFirst({
                where: { id: connectorId },
                select: { providerId: true }
            });
            const extIdKey = externalIdKeyForProvider(connectorMeta?.providerId);

            const rows = await db.$queryRaw<any[]>`
                SELECT
                    s.id,
                    s.session_id,
                    s.visitor_id,
                    s.started_at,
                    s.last_active_at,
                    s.device_type,
                    s.browser,
                    s.os,
                    s.landing_page,
                    s.referrer,
                    s.channel,
                    s.source,
                    s.medium,
                    s.campaign,
                    s.page_view_count,
                    s.funnel_stages_reached,
                    s.purchase_completed,
                    s.checkout_started,
                    s.funnel_stage,
                    s.metadata AS sess_metadata,
                    email_lookup.email_encrypted,
                    name_lookup.customer_name,
                    cid_lookup.customer_id,
                    v_email_lookup.email_encrypted AS v_email_encrypted,
                    v_name_lookup.customer_name AS v_customer_name,
                    v_cid_lookup.customer_id AS v_customer_id
                FROM storefront_sessions s
                LEFT JOIN LATERAL (
                    SELECT e.properties->>'email_encrypted' AS email_encrypted
                    FROM storefront_events e
                    WHERE e.session_id = s.session_id
                      AND e.connector_instance_id = s.connector_instance_id
                      AND e.properties->>'email_encrypted' IS NOT NULL
                    ORDER BY e.occurred_at DESC
                    LIMIT 1
                ) email_lookup ON true
                LEFT JOIN LATERAL (
                    SELECT e.properties->>'customer_name' AS customer_name
                    FROM storefront_events e
                    WHERE e.session_id = s.session_id
                      AND e.connector_instance_id = s.connector_instance_id
                      AND e.properties->>'customer_name' IS NOT NULL
                    ORDER BY e.occurred_at DESC
                    LIMIT 1
                ) name_lookup ON true
                LEFT JOIN LATERAL (
                    SELECT e.properties->>'customer_id' AS customer_id
                    FROM storefront_events e
                    WHERE e.session_id = s.session_id
                      AND e.connector_instance_id = s.connector_instance_id
                      AND e.properties->>'customer_id' IS NOT NULL
                    ORDER BY e.occurred_at DESC
                    LIMIT 1
                ) cid_lookup ON true
                -- Visitor-level fallback: visitor_id persists in localStorage
                -- across sessions, so once a shopper is identified in ANY session
                -- we can name their other sessions (e.g. ones whose identity beacon
                -- was dropped, or that started before identity resolved). Matched on
                -- visitor_id, used only when the session's own events carried none.
                LEFT JOIN LATERAL (
                    SELECT e.properties->>'email_encrypted' AS email_encrypted
                    FROM storefront_events e
                    WHERE e.visitor_id = s.visitor_id
                      AND e.connector_instance_id = s.connector_instance_id
                      AND e.properties->>'email_encrypted' IS NOT NULL
                    ORDER BY e.occurred_at DESC
                    LIMIT 1
                ) v_email_lookup ON true
                LEFT JOIN LATERAL (
                    SELECT e.properties->>'customer_name' AS customer_name
                    FROM storefront_events e
                    WHERE e.visitor_id = s.visitor_id
                      AND e.connector_instance_id = s.connector_instance_id
                      AND e.properties->>'customer_name' IS NOT NULL
                    ORDER BY e.occurred_at DESC
                    LIMIT 1
                ) v_name_lookup ON true
                LEFT JOIN LATERAL (
                    SELECT e.properties->>'customer_id' AS customer_id
                    FROM storefront_events e
                    WHERE e.visitor_id = s.visitor_id
                      AND e.connector_instance_id = s.connector_instance_id
                      AND e.properties->>'customer_id' IS NOT NULL
                    ORDER BY e.occurred_at DESC
                    LIMIT 1
                ) v_cid_lookup ON true
                WHERE s.connector_instance_id = ${connectorId}
                  ${channelFilter}
                ORDER BY s.started_at DESC
                LIMIT ${limit}
            `;

            // Resolve any captured numeric customer_ids to a synced profile so
            // sessions that only carried an id (the Shopify case) still show a
            // real name/email. Keyed by the platform's externalIds slot.
            const profileByExtId = new Map<string, { email: string | null; name: string | null }>();
            if (extIdKey) {
                const ids = Array.from(
                    new Set(
                        rows
                            .map((r: any) => r.sess_metadata?.identity?.customer_id || r.customer_id || r.v_customer_id)
                            .filter((v: any): v is string => typeof v === 'string' && v.length > 0)
                    )
                );
                if (ids.length > 0) {
                    const profiles: any[] = await db.$queryRawUnsafe(
                        `SELECT external_ids->>$1 AS ext_id, email_encrypted, metadata
                           FROM customer_profiles
                          WHERE connector_instance_id = $2
                            AND external_ids->>$1 = ANY($3::text[])`,
                        extIdKey,
                        connectorId,
                        ids
                    );
                    for (const p of profiles) {
                        if (!p.ext_id) continue;
                        profileByExtId.set(String(p.ext_id), {
                            email: p.email_encrypted ? decryptEmail(p.email_encrypted) : null,
                            name: nameFromMetadata(p.metadata)
                        });
                    }
                }
            }

            const sessions = rows.map((r: any) => {
                // Resolution order for each field:
                //   1. identity persisted on the session metadata itself (populated
                //      + visitor-backfilled at ingest — durable across restarts);
                //   2. this session's own events (historical rows not yet backfilled);
                //   3. any event from the same visitor_id;
                //   4. the synced customer_profiles row (Shopify numeric-id path).
                const sessionIdentity = r.sess_metadata?.identity || null;
                const resolvedCid = sessionIdentity?.customer_id || r.customer_id || r.v_customer_id || null;
                const profile = resolvedCid ? profileByExtId.get(String(resolvedCid)) : undefined;
                const persistedEmail = sessionIdentity?.customer_email_encrypted ? decryptEmail(sessionIdentity.customer_email_encrypted) : null;
                const sessionEmail = r.email_encrypted ? decryptEmail(r.email_encrypted) : null;
                const visitorEmail = r.v_email_encrypted ? decryptEmail(r.v_email_encrypted) : null;
                const email = persistedEmail || sessionEmail || visitorEmail || profile?.email || null;
                const customerName =
                    (sessionIdentity?.customer_name ? String(sessionIdentity.customer_name) : null) ||
                    (r.customer_name ? String(r.customer_name) : null) ||
                    (r.v_customer_name ? String(r.v_customer_name) : null) ||
                    profile?.name ||
                    null;
                return {
                    id: r.id,
                    session_id: r.session_id,
                    visitor_id: r.visitor_id,
                    started_at: r.started_at instanceof Date ? r.started_at.toISOString() : r.started_at,
                    last_active_at: r.last_active_at instanceof Date ? r.last_active_at.toISOString() : r.last_active_at,
                    device_type: r.device_type,
                    browser: r.browser,
                    os: r.os,
                    landing_page: r.landing_page,
                    referrer: r.referrer,
                    channel: r.channel,
                    source: r.source,
                    medium: r.medium,
                    campaign: r.campaign,
                    page_view_count: Number(r.page_view_count ?? 0),
                    // funnel_stages_reached is JSONB — Prisma returns it already parsed.
                    funnel_stages_reached: Array.isArray(r.funnel_stages_reached) ? r.funnel_stages_reached : [],
                    purchase_completed: Boolean(r.purchase_completed),
                    checkout_started: Boolean(r.checkout_started),
                    funnel_stage: r.funnel_stage,
                    // Decrypt in memory for display only. Never expose the
                    // email_encrypted envelope to the client — plaintext or null.
                    customer_name: customerName,
                    email
                };
            });

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
            const db = await getDataPlaneClient(connectorId);
            const rows = await db.$queryRaw<any[]>`
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
                ORDER BY occurred_at ASC
            `;

            const events = rows.map((r: any) => ({
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