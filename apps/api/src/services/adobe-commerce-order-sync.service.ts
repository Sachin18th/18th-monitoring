import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, decryptSecret } from '@kpi-platform/db';
import { orderNormalizationService } from './order-normalization.service';
import { interpretAdobeApiError } from './adobe-commerce-error.util';
import {
  getSinceCursor,
  computeMaxCheckpoint,
  toAdobeDateTime,
  ORDER_SYNC_TYPE,
  MAX_SYNC_PAGES
} from './sync-checkpoint.util';

const ADOBE_PAGE_DELAY_MS = 250;
const adobeDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ConnectorRecord = {
  id: string;
  tenantId: string;
  siteId: string;
  providerId: string;
  label: string;
  syncConfig: any;
};

type SyncSummary = {
  runId: string;
  fetched: number;
  created: number;
  updated: number;
  failed: number;
};

export class AdobeCommerceOrderSyncService {
  private static extractCustomerEmail(rawOrder: any): string | null {
    const candidates = [
      rawOrder?.customer_email,
      rawOrder?.email,
      rawOrder?.billing_address?.email,
      rawOrder?.extension_attributes?.shipping_assignments?.[0]?.shipping?.address?.email
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim().toLowerCase();
      }
    }

    return null;
  }

  static async syncConnectorInstance(connectorInstanceId: string): Promise<SyncSummary> {
    const instance = await prisma.connectorInstance.findUnique({
      where: { id: connectorInstanceId },
      select: {
        id: true,
        tenantId: true,
        siteId: true,
        providerId: true,
        label: true,
        syncConfig: true,
        credentials: {
          orderBy: { lastRotatedAt: 'desc' },
          take: 1,
          select: { encryptedSecret: true }
        }
      }
    });

    if (!instance) throw new Error('Integration instance not found.');
    if (instance.providerId !== 'adobe_commerce') throw new Error(`Provider "${instance.providerId}" is not supported by AdobeCommerceOrderSyncService.`);

    const runId = crypto.randomUUID();
    const startedAt = new Date();

    await prisma.connectorSyncRun.create({
      data: {
        id: runId,
        connectorInstanceId,
        syncType: ORDER_SYNC_TYPE,
        status: 'RUNNING',
        startedAt,
        recordsFetched: 0,
        recordsProcessed: 0,
        recordsFailed: 0
      }
    });

    await prisma.connectorInstance.update({ where: { id: connectorInstanceId }, data: { lastAttemptAt: startedAt, status: 'ACTIVE', lifecycleState: 'ACTIVE' } });

    try {
      // Incremental cursor: only orders updated since the last successful run (minus overlap).
      // Null on the first run → full backfill.
      const since = await getSinceCursor(connectorInstanceId, ORDER_SYNC_TYPE);
      const orders = await this.fetchOrders(instance, since);

      let created = 0;
      let updated = 0;
      let failed = 0;

      for (const raw of orders) {
        try {
          const canonical = await orderNormalizationService.normalize('adobe_commerce', raw, instance.siteId, instance.tenantId);
          const customerEmail = this.extractCustomerEmail(raw);

          // Upsert similar to Shopify but mark sourceSystem = 'adobe_commerce'
          const existing = await prisma.canonicalOrder.findFirst({
            where: {
              siteId: instance.siteId,
              tenantId: instance.tenantId,
              sourceSystem: 'adobe_commerce',
              OR: [
                { externalReferenceId: String(canonical.externalReferenceId || '') },
                { orderId: String(canonical.orderId || '') }
              ]
            },
            select: { id: true }
          });

          const data = {
            siteId: instance.siteId,
            tenantId: instance.tenantId,
            connectorInstanceId: instance.id,
            orderId: String(canonical.orderId),
            externalReferenceId: canonical.externalReferenceId ? String(canonical.externalReferenceId) : null,
            sourceSystem: 'adobe_commerce',
            channel: String(canonical.channel || 'online'),
            lifecycleState: String(canonical.lifecycleState),
            normalizedStatus: String(canonical.lifecycleState),
            currency: String(canonical.currency || 'USD'),
            totalAmount: Number(canonical.totalAmount || 0),
            taxAmount: Number(canonical.taxAmount || 0),
            discountAmount: Number(canonical.discountAmount || 0),
            paidAmount: Number(canonical.paidAmount || 0),
            refundedAmount: Number(canonical.refundedAmount || 0),
            placedAt: new Date((canonical as any).placedAt),
            paidAt: (canonical as any).paidAt ? new Date((canonical as any).paidAt) : null,
            shippedAt: (canonical as any).shippedAt ? new Date((canonical as any).shippedAt) : null,
            deliveredAt: null,
            mappingVersion: 'adobe_commerce/v1',
            metadata: {
              ...(canonical.metadata || {}),
              connectorInstanceId: instance.id,
              connectorLabel: instance.label,
              connectorStoreUrl: (() => {
                const config = (instance.syncConfig || {}) as Record<string, any>;
                const rawStoreUrl = String(config.storeUrl || '').trim();
                if (rawStoreUrl) return rawStoreUrl;

                const baseUrl = String(config.baseUrl || '').trim();
                return baseUrl || null;
              })(),
              customerEmail,
              adobeOrder: raw
            } as Prisma.InputJsonValue,
            updatedAt: new Date()
          };

          if (existing) {
            await prisma.$transaction(async (tx) => {
              await tx.canonicalOrder.update({ where: { id: existing.id }, data });
              await tx.orderSnapshot.create({ data: { orderInternalId: existing.id, projectId: instance.siteId, connectorInstanceId: instance.id, lifecycleState: String(canonical.lifecycleState), totalAmount: Number(canonical.totalAmount || 0), metadata: { syncSource: 'adobe_commerce', connectorInstanceId: instance.id } as Prisma.InputJsonValue } });
            });
            updated += 1;
          } else {
            const newId = crypto.randomUUID();
            await prisma.$transaction(async (tx) => {
              await tx.canonicalOrder.create({ data: { id: newId, ...data } });
              await tx.orderSnapshot.create({ data: { orderInternalId: newId, projectId: instance.siteId, connectorInstanceId: instance.id, lifecycleState: String(canonical.lifecycleState), totalAmount: Number(canonical.totalAmount || 0), metadata: { syncSource: 'adobe_commerce', connectorInstanceId: instance.id } as Prisma.InputJsonValue } });
              await tx.orderEvent.create({ data: { id: crypto.randomUUID(), orderInternalId: newId, projectId: instance.siteId, connectorInstanceId: instance.id, eventType: 'ADOBECOMMERCE_SYNC_IMPORT', timestamp: new Date(), payload: raw as Prisma.InputJsonValue, correlationId: instance.id } });
            });
            created += 1;
          }
        } catch (err) {
          failed += 1;
          console.error('[AdobeCommerceOrderSyncService] Failed to persist order', { connectorInstanceId, error: err });
        }
      }

      const finishedAt = new Date();
      await prisma.connectorSyncRun.update({ where: { id: runId }, data: { status: failed > 0 ? 'PARTIAL' : 'SUCCESS', finishedAt, recordsFetched: orders.length, recordsProcessed: created + updated, recordsFailed: failed, checkpointValue: failed > 0 ? null : computeMaxCheckpoint(orders, ['updated_at', 'created_at'], 'adobe_commerce') } });

      await prisma.connectorInstance.update({ where: { id: connectorInstanceId }, data: { lastSyncAt: finishedAt, lastAttemptAt: startedAt, healthStatus: failed > 0 ? 'DEGRADED' : 'HEALTHY', lifecycleState: failed > 0 ? 'DEGRADED' : 'ACTIVE', healthScore: failed > 0 ? 75 : 100, lastError: failed > 0 ? ({ message: `${failed} order(s) failed during sync.`, at: finishedAt.toISOString() } as Prisma.InputJsonValue) : Prisma.JsonNull } });

      await this.logLifecycleEvent(instance, failed > 0 ? 'CONNECTOR_SYNC_PARTIAL' : 'CONNECTOR_SYNCED', failed > 0 ? 'WARN' : 'INFO', {
        runId,
        fetched: orders.length,
        created,
        updated,
        failed
      });

      return { runId, fetched: orders.length, created, updated, failed };
    } catch (err: any) {
      const finishedAt = new Date();
      await prisma.connectorSyncRun.update({ where: { id: runId }, data: { status: 'FAILED', finishedAt, errorSummary: { message: err?.message || 'Unknown sync failure', at: finishedAt.toISOString() } as Prisma.InputJsonValue } });
      await prisma.connectorInstance.update({ where: { id: connectorInstanceId }, data: { lastAttemptAt: startedAt, healthStatus: 'DEGRADED', lifecycleState: 'DEGRADED', healthScore: 45, lastError: { message: err?.message || 'Unknown', at: finishedAt.toISOString() } as Prisma.InputJsonValue } });
      await this.logLifecycleEvent(instance, 'CONNECTOR_SYNC_FAILED', 'ERROR', {
        runId,
        message: err?.message || 'Unknown sync failure',
        at: finishedAt.toISOString()
      });
      throw err;
    }
  }

  private static async fetchOrders(instance: ConnectorRecord, since: Date | null): Promise<any[]> {
    const config = instance.syncConfig || {};
    // The connect flow persists the store URL under `storeUrl`; older/alt configs
    // may use `baseUrl`. Accept either so orders actually fetch.
    const base = String(config.baseUrl || config.storeUrl || '').trim().replace(/\/$/, '');
    if (!base) {
      console.warn('[AdobeCommerceOrderSyncService] fetchOrders:no-base-url', { siteId: instance.siteId });
      return [];
    }

    // Get credentials — newest first. `lastRotatedAt` is nullable and unset on
    // connect, so ordering by it is non-deterministic; use createdAt as the
    // reliable tiebreaker so reconnects always use the freshest token.
    const credential = await prisma.connectorCredential.findFirst({
      where: { connectorInstanceId: instance.id, isActive: true },
      orderBy: [{ createdAt: 'desc' }]
    });

    const credentials = this.parseCredentials(credential?.encryptedSecret);
    const accessToken = String(
      credentials.accessToken || credentials.adminApiToken || credentials.adminApiAccessToken || credentials.token || credentials.apiKey || ''
    ).trim();

    if (!accessToken) {
      throw new Error('Adobe Commerce integration is missing access token in credentials.');
    }

    console.log('[AdobeCommerceOrderSyncService] fetchOrders:start', {
      baseUrl: config.baseUrl,
      hasToken: Boolean(accessToken),
      maskedToken: accessToken ? `${accessToken.slice(0, 4)}...${accessToken.slice(-4)}` : 'missing',
      since: since?.toISOString() || null
    });

    const fetchFn: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;
    const pageSize = 100;
    const items: any[] = [];
    let currentPage = 1;
    let totalPages = 1;

    while (currentPage <= totalPages) {
      if (currentPage > MAX_SYNC_PAGES) {
        console.warn('[AdobeCommerceOrderSyncService] fetchOrders:page-cap-hit', { currentPage, totalSoFar: items.length });
        break;
      }

      const url = new URL(`${base}/rest/V1/orders`);
      url.searchParams.set('searchCriteria[sortOrders][0][field]', 'updated_at');
      url.searchParams.set('searchCriteria[sortOrders][0][direction]', 'ASC');
      url.searchParams.set('searchCriteria[pageSize]', String(pageSize));
      url.searchParams.set('searchCriteria[currentPage]', String(currentPage));
      // Incremental: only orders updated after the cursor. Omitted on full backfill.
      if (since) {
        url.searchParams.set('searchCriteria[filterGroups][0][filters][0][field]', 'updated_at');
        url.searchParams.set('searchCriteria[filterGroups][0][filters][0][conditionType]', 'gt');
        url.searchParams.set('searchCriteria[filterGroups][0][filters][0][value]', toAdobeDateTime(since));
      }

      const response = await fetchFn(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const body = await response.text();
        console.error('[AdobeCommerceOrderSyncService] fetchOrders:error-response', {
          status: response.status,
          statusText: response.statusText,
          body
        });
        throw new Error(interpretAdobeApiError(response.status, body, response.statusText));
      }

      const payload = await response.json();
      // Magento/Adobe Commerce returns { items: [...], search_criteria: {...}, total_count: N }
      const pageItems = Array.isArray(payload?.items) ? payload.items : [];
      items.push(...pageItems);

      const totalCount = Number(payload?.total_count || pageItems.length || 0);
      totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      currentPage += 1;

      if (currentPage <= totalPages) {
        await adobeDelay(ADOBE_PAGE_DELAY_MS);
      }
    }

    console.log('[AdobeCommerceOrderSyncService] fetchOrders:complete', {
      itemCount: items.length
    });

    return items;
  }

  private static parseCredentials(serialized: string | null | undefined): Record<string, any> {
    if (!serialized) {
      return {};
    }

    try {
      // Decrypts the AES-256-GCM envelope in memory (with legacy-plaintext fallback).
      // Never log the returned credentials.
      const parsed = decryptSecret(serialized);
      if (!parsed || typeof parsed !== 'object') return {};

      // Ensure we expose `accessToken` regardless of the incoming key name
      if (parsed.accessToken) return parsed;

      const altToken = parsed.accessToken || parsed.adminApiToken || parsed.adminApiAccessToken || parsed.token || parsed.apiKey || parsed.api_key || parsed.bearerToken;
      if (altToken) {
        return { ...parsed, accessToken: String(altToken) };
      }

      return parsed;
    } catch {
      return {};
    }
  }

  private static async logLifecycleEvent(
    instance: ConnectorRecord,
    eventType: string,
    severity: 'INFO' | 'WARN' | 'ERROR',
    payload: any
  ): Promise<void> {
    try {
      await prisma.connectorLifecycleEvent.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: instance.tenantId,
          projectId: instance.siteId,
          connectorInstanceId: instance.id,
          eventType,
          severity,
          payload: payload as Prisma.InputJsonValue,
          triggeredBy: 'SYSTEM'
        }
      });
    } catch (err) {
      console.error('[AdobeCommerceOrderSyncService] Failed to log lifecycle event', { err });
    }
  }
}

export default AdobeCommerceOrderSyncService;
