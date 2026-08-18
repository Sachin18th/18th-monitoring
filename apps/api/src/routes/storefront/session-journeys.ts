import { FastifyInstance } from 'fastify';
import { Prisma } from '.prisma/tenant-client';
import { prisma, decryptEmail, hashEmail } from '@kpi-platform/db';
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
 *
 * ── Scale ───────────────────────────────────────────────────────────────────
 * A busy store produces thousands of sessions a day, so the list is never "all
 * sessions". Three things keep it bounded:
 *   1. a started_at window (default 24h, clamped to MAX_WINDOW_DAYS);
 *   2. filters — outcome bucket, channel, device, identified, depth, search;
 *   3. a (started_at, id) keyset cursor, so page N costs the same as page 1.
 * Callers get bucket counts from /session-journey-counts to decide where to
 * drill in, instead of paging through the raw firehose.
 */
export const sessionJourneyRoutes = async (fastify: FastifyInstance) => {
    fastify.addHook('preHandler', tenantAuthHandler);

    const DEFAULT_LIMIT = 25;
    const MAX_LIMIT = 50;
    const DEFAULT_WINDOW_HOURS = 24;
    // Hard bound on how far back one request may scan. Beyond this the answer
    // belongs to a rollup, not to a session list.
    const MAX_WINDOW_DAYS = 90;

    const CHANNELS = new Set(['google', 'meta', 'organic', 'direct', 'other']);
    const DEVICES = new Set(['desktop', 'mobile', 'tablet']);
    const OUTCOMES = new Set(['converted', 'abandoned_checkout', 'browsed', 'bounced']);

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

    // ── Ranking ─────────────────────────────────────────────────────────────
    // sort=intent surfaces sessions worth a human look before merely-recent
    // ones: an abandoned checkout outranks a converted browse, which outranks a
    // one-page bounce. Kept as an integer so it can carry a keyset cursor.
    const INTENT_SCORE = Prisma.sql`(
        CASE WHEN s.checkout_started AND NOT s.purchase_completed THEN 3000 ELSE 0 END
        + CASE WHEN s.add_to_cart AND NOT s.purchase_completed THEN 1000 ELSE 0 END
        + LEAST(s.page_view_count, 100) * 5
    )`;

    // Whether a session carries any resolved buyer identity. Mirrors the
    // resolution order applied on the read path below.
    const IDENTIFIED = Prisma.sql`(
        s.customer_profile_id IS NOT NULL
        OR s.metadata->'identity'->>'customer_email_encrypted' IS NOT NULL
        OR s.metadata->'identity'->>'customer_name' IS NOT NULL
        OR s.metadata->'identity'->>'customer_id' IS NOT NULL
    )`;

    // Outcome buckets. These deliberately overlap (a bounce is also not a
    // conversion) — they are lenses for drilling in, not a partition, so their
    // counts are not expected to sum to the total.
    const outcomePredicate = (outcome: string): Prisma.Sql | null => {
        switch (outcome) {
            case 'converted':
                return Prisma.sql`s.purchase_completed`;
            case 'abandoned_checkout':
                return Prisma.sql`s.checkout_started AND NOT s.purchase_completed`;
            case 'browsed':
                return Prisma.sql`s.product_viewed AND NOT s.add_to_cart AND NOT s.purchase_completed`;
            case 'bounced':
                return Prisma.sql`s.page_view_count <= 1 AND NOT s.purchase_completed`;
            default:
                return null;
        }
    };

    // ── Keyset cursor ───────────────────────────────────────────────────────
    // Opaque base64url JSON. `s` pins the sort the cursor was minted for, so a
    // cursor cannot be replayed against a different ordering; `k` carries the
    // intent score (absent for sort=recent).
    interface Cursor {
        s: string;
        k?: number;
        t: string;
        i: string;
    }

    const encodeCursor = (c: Cursor): string =>
        Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');

    const decodeCursor = (raw: unknown, sort: string): Cursor | null => {
        if (typeof raw !== 'string' || !raw) return null;
        try {
            const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
            if (!parsed || parsed.s !== sort) return null;
            if (typeof parsed.t !== 'string' || typeof parsed.i !== 'string') return null;
            if (Number.isNaN(new Date(parsed.t).getTime())) return null;
            return parsed as Cursor;
        } catch {
            return null;
        }
    };

    const parseDate = (raw: unknown): Date | null => {
        if (typeof raw !== 'string' || !raw) return null;
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? null : d;
    };

    /**
     * Resolves a free-text search term into SQL-matchable handles.
     *
     * Emails cannot be matched in SQL — storefront identity is stored as an
     * AES-GCM envelope with a random IV, so ciphertext is not comparable. An
     * email term is instead hashed and looked up against customer_profiles
     * (one-way email_hash), giving us the profile id + the platform's numeric
     * customer id, both of which sessions DO carry.
     */
    const resolveSearch = async (
        db: any,
        connectorId: string,
        extIdKey: string | null,
        term: string
    ): Promise<{ profileIds: string[]; extIds: string[] }> => {
        if (!term.includes('@')) return { profileIds: [], extIds: [] };
        const emailHash = hashEmail(term);
        if (!emailHash) return { profileIds: [], extIds: [] };

        const rows: any[] = extIdKey
            ? await db.$queryRawUnsafe(
                  `SELECT id, external_ids->>$1 AS ext_id
                     FROM customer_profiles
                    WHERE connector_instance_id = $2 AND email_hash = $3
                    LIMIT 50`,
                  extIdKey,
                  connectorId,
                  emailHash
              )
            : await db.$queryRaw`
                  SELECT id, NULL AS ext_id
                    FROM customer_profiles
                   WHERE connector_instance_id = ${connectorId} AND email_hash = ${emailHash}
                   LIMIT 50
              `;

        return {
            profileIds: rows.map((r) => String(r.id)).filter(Boolean),
            extIds: rows.map((r) => r.ext_id).filter((v: any): v is string => typeof v === 'string' && v.length > 0)
        };
    };

    /**
     * Builds the shared WHERE fragments for both the list and the counts query,
     * so a bucket count can never disagree with the rows the bucket lists.
     * `outcome` is applied by the list only — the counts endpoint reports every
     * bucket at once.
     */
    const buildScope = async (
        db: any,
        connectorId: string,
        extIdKey: string | null,
        query: any
    ): Promise<{ from: Date; to: Date; clamped: boolean; filters: Prisma.Sql[] }> => {
        const now = new Date();
        const to = parseDate(query.to) || now;
        const requestedFrom =
            parseDate(query.from) || new Date(to.getTime() - DEFAULT_WINDOW_HOURS * 3600_000);
        const earliest = new Date(to.getTime() - MAX_WINDOW_DAYS * 86_400_000);
        const clamped = requestedFrom < earliest;
        const from = clamped ? earliest : requestedFrom;

        const filters: Prisma.Sql[] = [
            Prisma.sql`s.connector_instance_id = ${connectorId}`,
            Prisma.sql`s.started_at >= ${from}`,
            Prisma.sql`s.started_at <= ${to}`
        ];

        const channel = String(query.channel || '').toLowerCase();
        if (CHANNELS.has(channel)) filters.push(Prisma.sql`s.channel = ${channel}`);

        const device = String(query.device || '').toLowerCase();
        if (DEVICES.has(device)) filters.push(Prisma.sql`LOWER(s.device_type) = ${device}`);

        const identified = String(query.identified || '').toLowerCase();
        if (identified === 'true') filters.push(Prisma.sql`(${IDENTIFIED})`);
        else if (identified === 'false') filters.push(Prisma.sql`NOT ${IDENTIFIED}`);

        const minPageViews = Number(query.minPageViews);
        if (Number.isFinite(minPageViews) && minPageViews > 0) {
            filters.push(Prisma.sql`s.page_view_count >= ${Math.floor(minPageViews)}`);
        }

        // Live tail: only sessions newer than what the client already holds.
        const after = parseDate(query.after);
        if (after) filters.push(Prisma.sql`s.started_at > ${after}`);

        const term = String(query.q || '').trim();
        if (term) {
            const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
            const prefix = `${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
            const parts: Prisma.Sql[] = [
                Prisma.sql`s.metadata->'identity'->>'customer_name' ILIKE ${like}`,
                Prisma.sql`s.visitor_id ILIKE ${prefix}`,
                Prisma.sql`s.session_id ILIKE ${prefix}`
            ];
            const { profileIds, extIds } = await resolveSearch(db, connectorId, extIdKey, term);
            if (profileIds.length > 0) {
                parts.push(Prisma.sql`s.customer_profile_id IN (${Prisma.join(profileIds)})`);
            }
            if (extIds.length > 0) {
                parts.push(
                    Prisma.sql`s.metadata->'identity'->>'customer_id' IN (${Prisma.join(extIds)})`
                );
            }
            filters.push(Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
        }

        return { from, to, clamped, filters };
    };

    const andWhere = (filters: Prisma.Sql[]): Prisma.Sql =>
        filters.length > 0 ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty;

    /**
     * GET /api/storefront/session-journeys
     *
     * Query: projectId, connectorInstanceId (required)
     *        from, to        — ISO window; defaults to the last 24h
     *        after           — ISO, exclusive; live-tail "newer than this"
     *        outcome         — converted | abandoned_checkout | browsed | bounced
     *        channel, device, identified, minPageViews, q
     *        sort            — recent (default) | intent
     *        cursor, limit   — keyset page (limit default 25, max 50)
     *
     * Returns one page of sessions plus `nextCursor` (null when exhausted).
     */
    fastify.get('/session-journeys', async (req: any, reply: any) => {
        const { projectId, connectorInstanceId } = req.query || {};
        const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
        if (!connectorId) return;

        const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
        const sort = req.query.sort === 'intent' ? 'intent' : 'recent';

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

            const { from, to, clamped, filters } = await buildScope(db, connectorId, extIdKey, req.query);

            const outcome = String(req.query.outcome || '').toLowerCase();
            if (OUTCOMES.has(outcome)) {
                const pred = outcomePredicate(outcome);
                if (pred) filters.push(Prisma.sql`(${pred})`);
            }

            // Keyset predicate + ordering. Row comparison keeps the tiebreak
            // index-ordered when several sessions share a started_at.
            const cursor = decodeCursor(req.query.cursor, sort);
            let orderBy: Prisma.Sql;
            if (sort === 'intent') {
                if (cursor) {
                    filters.push(
                        Prisma.sql`(${INTENT_SCORE}, s.started_at, s.id) < (${Math.trunc(
                            Number(cursor.k) || 0
                        )}, ${new Date(cursor.t)}, ${cursor.i})`
                    );
                }
                orderBy = Prisma.sql`ORDER BY ${INTENT_SCORE} DESC, s.started_at DESC, s.id DESC`;
            } else {
                if (cursor) {
                    filters.push(
                        Prisma.sql`(s.started_at, s.id) < (${new Date(cursor.t)}, ${cursor.i})`
                    );
                }
                orderBy = Prisma.sql`ORDER BY s.started_at DESC, s.id DESC`;
            }

            // Fetch limit + 1: the extra row is the "has next page" signal, so no
            // COUNT(*) over the window is needed to render pagination.
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
                    s.product_viewed,
                    s.add_to_cart,
                    s.purchase_completed,
                    s.checkout_started,
                    s.funnel_stage,
                    s.metadata AS sess_metadata,
                    ${INTENT_SCORE} AS intent_score,
                    email_lookup.email_encrypted,
                    name_lookup.customer_name,
                    cid_lookup.customer_id,
                    v_email_lookup.email_encrypted AS v_email_encrypted,
                    v_name_lookup.customer_name AS v_customer_name,
                    v_cid_lookup.customer_id AS v_customer_id
                FROM storefront_sessions s
                -- Identity fallbacks for rows ingested before identity was
                -- persisted onto the session itself. Each lateral is gated on the
                -- persisted value being absent, as a one-time filter evaluated
                -- before the index scan — so for a session that already carries
                -- identity (the normal case now) these cost nothing.
                LEFT JOIN LATERAL (
                    SELECT e.properties->>'email_encrypted' AS email_encrypted
                    FROM storefront_events e
                    WHERE s.metadata->'identity'->>'customer_email_encrypted' IS NULL
                      AND e.session_id = s.session_id
                      AND e.connector_instance_id = s.connector_instance_id
                      AND e.properties->>'email_encrypted' IS NOT NULL
                    ORDER BY e.occurred_at DESC
                    LIMIT 1
                ) email_lookup ON true
                LEFT JOIN LATERAL (
                    SELECT e.properties->>'customer_name' AS customer_name
                    FROM storefront_events e
                    WHERE s.metadata->'identity'->>'customer_name' IS NULL
                      AND e.session_id = s.session_id
                      AND e.connector_instance_id = s.connector_instance_id
                      AND e.properties->>'customer_name' IS NOT NULL
                    ORDER BY e.occurred_at DESC
                    LIMIT 1
                ) name_lookup ON true
                LEFT JOIN LATERAL (
                    SELECT e.properties->>'customer_id' AS customer_id
                    FROM storefront_events e
                    WHERE s.metadata->'identity'->>'customer_id' IS NULL
                      AND e.session_id = s.session_id
                      AND e.connector_instance_id = s.connector_instance_id
                      AND e.properties->>'customer_id' IS NOT NULL
                    ORDER BY e.occurred_at DESC
                    LIMIT 1
                ) cid_lookup ON true
                -- Visitor-level fallback: visitor_id persists in localStorage
                -- across sessions, so once a shopper is identified in ANY session
                -- we can name their other sessions (e.g. ones whose identity beacon
                -- was dropped, or that started before identity resolved). Matched on
                -- visitor_id via idx_storefront_event_visitor, and gated on the
                -- session-level lookup above having come up empty too.
                LEFT JOIN LATERAL (
                    SELECT e.properties->>'email_encrypted' AS email_encrypted
                    FROM storefront_events e
                    WHERE s.metadata->'identity'->>'customer_email_encrypted' IS NULL
                      AND email_lookup.email_encrypted IS NULL
                      AND e.visitor_id = s.visitor_id
                      AND e.connector_instance_id = s.connector_instance_id
                      AND e.properties->>'email_encrypted' IS NOT NULL
                    ORDER BY e.occurred_at DESC
                    LIMIT 1
                ) v_email_lookup ON true
                LEFT JOIN LATERAL (
                    SELECT e.properties->>'customer_name' AS customer_name
                    FROM storefront_events e
                    WHERE s.metadata->'identity'->>'customer_name' IS NULL
                      AND name_lookup.customer_name IS NULL
                      AND e.visitor_id = s.visitor_id
                      AND e.connector_instance_id = s.connector_instance_id
                      AND e.properties->>'customer_name' IS NOT NULL
                    ORDER BY e.occurred_at DESC
                    LIMIT 1
                ) v_name_lookup ON true
                LEFT JOIN LATERAL (
                    SELECT e.properties->>'customer_id' AS customer_id
                    FROM storefront_events e
                    WHERE s.metadata->'identity'->>'customer_id' IS NULL
                      AND cid_lookup.customer_id IS NULL
                      AND e.visitor_id = s.visitor_id
                      AND e.connector_instance_id = s.connector_instance_id
                      AND e.properties->>'customer_id' IS NOT NULL
                    ORDER BY e.occurred_at DESC
                    LIMIT 1
                ) v_cid_lookup ON true
                ${andWhere(filters)}
                ${orderBy}
                LIMIT ${limit + 1}
            `;

            const hasMore = rows.length > limit;
            const pageRows = hasMore ? rows.slice(0, limit) : rows;

            // Resolve any captured numeric customer_ids to a synced profile so
            // sessions that only carried an id (the Shopify case) still show a
            // real name/email. Keyed by the platform's externalIds slot.
            const profileByExtId = new Map<string, { email: string | null; name: string | null }>();
            if (extIdKey) {
                const ids = Array.from(
                    new Set(
                        pageRows
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

            const sessions = pageRows.map((r: any) => {
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
                    product_viewed: Boolean(r.product_viewed),
                    add_to_cart: Boolean(r.add_to_cart),
                    purchase_completed: Boolean(r.purchase_completed),
                    checkout_started: Boolean(r.checkout_started),
                    funnel_stage: r.funnel_stage,
                    // Decrypt in memory for display only. Never expose the
                    // email_encrypted envelope to the client — plaintext or null.
                    customer_name: customerName,
                    email
                };
            });

            const last = pageRows[pageRows.length - 1];
            const nextCursor =
                hasMore && last
                    ? encodeCursor({
                          s: sort,
                          ...(sort === 'intent' ? { k: Number(last.intent_score ?? 0) } : {}),
                          t: last.started_at instanceof Date ? last.started_at.toISOString() : String(last.started_at),
                          i: String(last.id)
                      })
                    : null;

            return reply.code(200).send(
                successResponse({
                    sessions,
                    nextCursor,
                    window: { from: from.toISOString(), to: to.toISOString(), clamped, maxDays: MAX_WINDOW_DAYS }
                })
            );
        } catch (err: any) {
            req.log?.error?.({ err }, '[session-journeys] list failed');
            return reply.code(500).send(errorResponse('Failed to load session journeys', 'INTERNAL_SERVER_ERROR'));
        }
    });

    /**
     * GET /api/storefront/session-journey-counts
     *
     * Same scope filters as the list (minus `outcome`), aggregated in one pass.
     * Powers the outcome tiles and the "of N" label, so the list itself never
     * has to COUNT(*) over the window.
     */
    fastify.get('/session-journey-counts', async (req: any, reply: any) => {
        const { projectId, connectorInstanceId } = req.query || {};
        const connectorId = await authorizeConnector(req, reply, projectId, connectorInstanceId);
        if (!connectorId) return;

        try {
            const db = await getDataPlaneClient(connectorId);
            const connectorMeta = await prisma.connectorInstance.findFirst({
                where: { id: connectorId },
                select: { providerId: true }
            });
            const extIdKey = externalIdKeyForProvider(connectorMeta?.providerId);
            const { from, to, clamped, filters } = await buildScope(db, connectorId, extIdKey, req.query);

            const rows = await db.$queryRaw<any[]>`
                SELECT
                    COUNT(*) FILTER (WHERE ${outcomePredicate('converted')!})          AS converted,
                    COUNT(*) FILTER (WHERE ${outcomePredicate('abandoned_checkout')!}) AS abandoned_checkout,
                    COUNT(*) FILTER (WHERE ${outcomePredicate('browsed')!})            AS browsed,
                    COUNT(*) FILTER (WHERE ${outcomePredicate('bounced')!})            AS bounced,
                    COUNT(*) FILTER (WHERE ${IDENTIFIED})                              AS identified,
                    COUNT(*)                                                           AS total
                FROM storefront_sessions s
                ${andWhere(filters)}
            `;

            const r = rows[0] || {};
            const n = (v: any) => Number(v ?? 0);
            return reply.code(200).send(
                successResponse({
                    counts: {
                        converted: n(r.converted),
                        abandoned_checkout: n(r.abandoned_checkout),
                        browsed: n(r.browsed),
                        bounced: n(r.bounced),
                        identified: n(r.identified),
                        total: n(r.total)
                    },
                    window: { from: from.toISOString(), to: to.toISOString(), clamped, maxDays: MAX_WINDOW_DAYS }
                })
            );
        } catch (err: any) {
            req.log?.error?.({ err }, '[session-journeys] counts failed');
            return reply.code(500).send(errorResponse('Failed to load session counts', 'INTERNAL_SERVER_ERROR'));
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
