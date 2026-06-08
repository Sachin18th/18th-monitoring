import crypto from 'crypto';
import { prisma } from '@kpi-platform/db';
import { rumGate } from '../utils/rum-rate-limit';

type ErrorType = 'js_error' | 'network_error' | 'resource_error' | 'promise_rejection';
type Severity = 'critical' | 'warning' | 'info';
type PageType = 'homepage' | 'pdp' | 'plp' | 'checkout' | 'other';

const VALID_TYPES = new Set<ErrorType>(['js_error', 'network_error', 'resource_error', 'promise_rejection']);

// Category buckets used by the dashboard summary + type filter. "js" spans both
// uncaught exceptions and promise rejections.
const CATEGORY_TYPES: Record<'js' | 'network' | 'resource', ErrorType[]> = {
  js: ['js_error', 'promise_rejection'],
  network: ['network_error'],
  resource: ['resource_error'],
};

export class StorefrontErrorService {
  /** Auto-classify severity from type + HTTP status (see spec). */
  static classifySeverity(type: ErrorType, statusCode?: number | null): Severity {
    if (type === 'js_error' || type === 'promise_rejection') return 'critical';
    if (type === 'network_error') {
      if (typeof statusCode === 'number' && statusCode >= 500) return 'critical';
      if (typeof statusCode === 'number' && statusCode >= 400) return 'warning';
      return 'info';
    }
    if (type === 'resource_error') return 'warning';
    return 'info';
  }

  /** Detect page type from a page URL's path. */
  static detectPageType(pageUrl?: string | null): PageType {
    let path = '';
    try {
      path = pageUrl ? new URL(pageUrl).pathname.toLowerCase() : '';
    } catch {
      path = String(pageUrl || '').toLowerCase();
    }

    if (/\/(products|p)\//.test(path)) return 'pdp';
    if (/\/(collections|category|c)\//.test(path)) return 'plp';
    if (/\/(cart|checkout)\b/.test(path) || path.endsWith('/cart') || path.endsWith('/checkout')) return 'checkout';
    if (path === '' || path === '/') return 'homepage';
    return 'other';
  }

  /**
   * Ingest a batch. Validates required fields, applies per-session rate limit +
   * dedup, classifies severity, detects page type, and bulk-inserts.
   */
  static async ingestBatch(projectId: string, connectorId: string | null, errors: any[]): Promise<{ accepted: number; rejected: number }> {
    if (!projectId) return { accepted: 0, rejected: Array.isArray(errors) ? errors.length : 0 };
    if (!Array.isArray(errors) || errors.length === 0) return { accepted: 0, rejected: 0 };

    // Project must exist (FK). Reject the whole batch cleanly if not.
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return { accepted: 0, rejected: errors.length };

    // Only attach a connector_id that actually exists for this project, else null.
    let safeConnectorId: string | null = null;
    if (connectorId) {
      const connector = await prisma.connectorInstance.findFirst({ where: { id: connectorId, siteId: projectId }, select: { id: true } });
      safeConnectorId = connector?.id || null;
    }

    const now = new Date();
    const rows: any[] = [];
    let rejected = 0;

    for (const raw of errors) {
      const type = String(raw?.error_type || raw?.errorType || '').trim() as ErrorType;
      const message = typeof raw?.message === 'string' ? raw.message : '';
      const occurredRaw = raw?.occurred_at || raw?.occurredAt;
      const occurredAt = occurredRaw ? new Date(occurredRaw) : null;

      // Required fields: error_type, message, occurred_at.
      if (!VALID_TYPES.has(type) || !message.trim() || !occurredAt || isNaN(occurredAt.getTime())) {
        rejected += 1;
        continue;
      }

      const sourceUrl = raw?.source_url || raw?.sourceUrl || null;
      const sessionId = raw?.session_id || raw?.sessionId || null;

      const gate = rumGate(sessionId, message, sourceUrl);
      if (!gate.allowed) {
        rejected += 1;
        continue;
      }

      const statusCode = Number.isFinite(Number(raw?.status_code ?? raw?.statusCode)) ? Number(raw?.status_code ?? raw?.statusCode) : null;
      const pageUrl = raw?.page_url || raw?.pageUrl || null;

      rows.push({
        id: crypto.randomUUID(),
        connectorInstanceId: safeConnectorId,
        projectId,
        errorType: type,
        severity: this.classifySeverity(type, statusCode),
        message: message.slice(0, 4000),
        sourceUrl: sourceUrl ? String(sourceUrl).slice(0, 2000) : null,
        stackTrace: raw?.stack_trace || raw?.stackTrace || raw?.stack || null,
        requestUrl: raw?.request_url || raw?.requestUrl || null,
        statusCode,
        httpMethod: raw?.http_method || raw?.httpMethod || null,
        durationMs: Number.isFinite(Number(raw?.duration_ms ?? raw?.durationMs)) ? Math.round(Number(raw?.duration_ms ?? raw?.durationMs)) : null,
        resourceTag: raw?.resource_tag || raw?.resourceTag || null,
        pageType: this.detectPageType(pageUrl),
        pageUrl: pageUrl ? String(pageUrl).slice(0, 2000) : null,
        userAgent: raw?.user_agent || raw?.userAgent || null,
        sessionId: sessionId ? String(sessionId).slice(0, 100) : null,
        occurredAt,
        createdAt: now,
      });
    }

    if (rows.length > 0) {
      await (prisma.storefrontError as any).createMany({ data: rows });
    }

    return { accepted: rows.length, rejected };
  }

  /** Build the summary + paginated rows for the dashboard Errors tab. */
  static async query(input: {
    projectId: string;
    connectorId?: string | null;
    type?: string | null; // category: js | network | resource
    page?: string | null; // page_type
    from?: string | null;
    to?: string | null;
    limit?: number | null;
    offset?: number | null;
  }) {
    const to = input.to ? new Date(input.to) : new Date();
    const from = input.from ? new Date(input.from) : new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
    const offset = Math.max(Number(input.offset) || 0, 0);

    const scope = {
      projectId: input.projectId,
      ...(input.connectorId ? { connectorInstanceId: input.connectorId } : {}),
    };

    // ── Summary counts per category, this window vs the previous equal window ──
    const windowMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - windowMs);

    const countFor = (types: ErrorType[], start: Date, end: Date) =>
      (prisma.storefrontError as any).count({
        where: { ...scope, errorType: { in: types }, occurredAt: { gte: start, lte: end } },
      });

    const [jsNow, jsPrev, netNow, netPrev, resNow, resPrev] = await Promise.all([
      countFor(CATEGORY_TYPES.js, from, to),
      countFor(CATEGORY_TYPES.js, prevFrom, from),
      countFor(CATEGORY_TYPES.network, from, to),
      countFor(CATEGORY_TYPES.network, prevFrom, from),
      countFor(CATEGORY_TYPES.resource, from, to),
      countFor(CATEGORY_TYPES.resource, prevFrom, from),
    ]);

    const summary = {
      js_errors: this.buildSummary(jsNow, jsPrev),
      network_errors: this.buildSummary(netNow, netPrev),
      resource_errors: this.buildSummary(resNow, resPrev),
    };

    // ── Paginated rows (filtered by category + page) ──────────────────────────
    const typeFilter = input.type && CATEGORY_TYPES[input.type as 'js' | 'network' | 'resource']
      ? { errorType: { in: CATEGORY_TYPES[input.type as 'js' | 'network' | 'resource'] } }
      : {};
    const pageFilter = input.page && input.page !== 'all' ? { pageType: input.page } : {};

    const where = { ...scope, ...typeFilter, ...pageFilter, occurredAt: { gte: from, lte: to } };

    const [rows, total] = await Promise.all([
      (prisma.storefrontError as any).findMany({ where, orderBy: { occurredAt: 'desc' }, take: limit, skip: offset }),
      (prisma.storefrontError as any).count({ where }),
    ]);

    return {
      summary,
      errors: rows.map((r: any) => ({
        id: r.id,
        error_type: r.errorType,
        severity: r.severity,
        message: r.message,
        page_type: r.pageType,
        page_url: r.pageUrl,
        request_url: r.requestUrl,
        status_code: r.statusCode,
        http_method: r.httpMethod,
        source_url: r.sourceUrl,
        occurred_at: r.occurredAt ? r.occurredAt.toISOString() : null,
      })),
      total,
    };
  }

  private static buildSummary(now: number, prev: number) {
    const diff = now - prev;
    const trend = diff > 0 ? `+${diff} vs yesterday` : diff < 0 ? `${diff} vs yesterday` : 'same as yesterday';
    const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    return { count: now, trend, direction };
  }
}
