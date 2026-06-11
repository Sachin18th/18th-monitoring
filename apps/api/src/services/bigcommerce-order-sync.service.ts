import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, decryptSecret } from '@kpi-platform/db';
import { orderNormalizationService } from './order-normalization.service';

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

export class BigCommerceOrderSyncService {
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
    if (instance.providerId !== 'bigcommerce') throw new Error(`Provider "${instance.providerId}" is not supported by BigCommerceOrderSyncService.`);

    const credentials = this.parseCredentials(instance.credentials?.[0]?.encryptedSecret);
    const config = (instance.syncConfig || {}) as Record<string, any>;
    const baseUrl = this.resolveBaseUrl(config);
    const accessToken = String(credentials.accessToken || credentials.token || credentials.storeApiToken || '').trim();

    if (!baseUrl) {
      throw new Error('BigCommerce integration is missing storeHash/baseUrl in syncConfig.');
    }

    if (!accessToken) {
      throw new Error('BigCommerce integration is missing accessToken credentials.');
    }

    const runId = crypto.randomUUID();
    const startedAt = new Date();

    await prisma.connectorSyncRun.create({
      data: {
        id: runId,
        connectorInstanceId,
        syncType: 'MANUAL_RESYNC',
        status: 'RUNNING',
        startedAt,
        recordsFetched: 0,
        recordsProcessed: 0,
        recordsFailed: 0
      }
    });

    await prisma.connectorInstance.update({
      where: { id: connectorInstanceId },
      data: {
        lastAttemptAt: startedAt,
        status: 'ACTIVE',
        lifecycleState: 'ACTIVE'
      }
    });

    try {
      const orders = await this.fetchOrders({ baseUrl, accessToken });

      let created = 0;
      let updated = 0;
      let failed = 0;

      for (const rawOrder of orders) {
        try {
          const result = await this.upsertCanonicalOrder(instance, rawOrder);
          if (result === 'created') {
            created += 1;
          } else {
            updated += 1;
          }
        } catch (err) {
          failed += 1;
          console.error('[BigCommerceOrderSyncService] Failed to persist order', {
            connectorInstanceId,
            orderId: rawOrder?.id,
            error: err
          });
        }
      }

      const finishedAt = new Date();
      await prisma.connectorSyncRun.update({
        where: { id: runId },
        data: {
          status: failed > 0 ? 'PARTIAL' : 'SUCCESS',
          finishedAt,
          recordsFetched: orders.length,
          recordsProcessed: created + updated,
          recordsFailed: failed,
          checkpointValue: orders[0]?.date_modified || orders[0]?.date_created || null
        }
      });

      await prisma.connectorInstance.update({
        where: { id: connectorInstanceId },
        data: {
          lastSyncAt: finishedAt,
          lastAttemptAt: startedAt,
          healthStatus: failed > 0 ? 'DEGRADED' : 'HEALTHY',
          lifecycleState: failed > 0 ? 'DEGRADED' : 'ACTIVE',
          healthScore: failed > 0 ? 75 : 100,
          lastError: failed > 0
            ? ({
                message: `${failed} order(s) failed during sync.`,
                at: finishedAt.toISOString()
              } as Prisma.InputJsonValue)
            : Prisma.JsonNull
        }
      });

      await this.logLifecycleEvent(instance, failed > 0 ? 'CONNECTOR_SYNC_PARTIAL' : 'CONNECTOR_SYNCED', failed > 0 ? 'WARN' : 'INFO', {
        runId,
        fetched: orders.length,
        created,
        updated,
        failed
      });

      return {
        runId,
        fetched: orders.length,
        created,
        updated,
        failed
      };
    } catch (err: any) {
      const finishedAt = new Date();
      const errorPayload = {
        message: err?.message || 'Unknown sync failure',
        at: finishedAt.toISOString()
      };

      await prisma.connectorSyncRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          finishedAt,
          errorSummary: errorPayload as Prisma.InputJsonValue
        }
      });

      await prisma.connectorInstance.update({
        where: { id: connectorInstanceId },
        data: {
          lastAttemptAt: startedAt,
          healthStatus: 'DEGRADED',
          lifecycleState: 'DEGRADED',
          healthScore: 45,
          lastError: errorPayload as Prisma.InputJsonValue
        }
      });

      await this.logLifecycleEvent(instance, 'CONNECTOR_SYNC_FAILED', 'ERROR', {
        runId,
        ...errorPayload
      });

      throw err;
    }
  }

  private static async fetchOrders(input: {
    baseUrl: string;
    accessToken: string;
  }): Promise<any[]> {
    const url = new URL(`${input.baseUrl}/v2/orders`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', '1');
    url.searchParams.set('sort', 'date_modified:desc');

    const fetchFunc: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;
    const allOrders: any[] = [];
    let currentPage = 1;

    while (true) {
      url.searchParams.set('page', String(currentPage));

      const response = await fetchFunc(url.toString(), {
        method: 'GET',
        headers: {
          'X-Auth-Token': input.accessToken,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`BigCommerce API request failed (${response.status}): ${body || response.statusText}`);
      }

      const payload = await response.json();
      const pageOrders = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      allOrders.push(...pageOrders);

      if (pageOrders.length < 250) {
        break;
      }

      currentPage += 1;
    }

    return allOrders;
  }

  private static async upsertCanonicalOrder(instance: ConnectorRecord, rawOrder: any): Promise<'created' | 'updated'> {
    const canonical = await orderNormalizationService.normalize(
      'bigcommerce',
      rawOrder,
      instance.siteId,
      instance.tenantId
    );

    const existing = await prisma.canonicalOrder.findFirst({
      where: {
        siteId: instance.siteId,
        tenantId: instance.tenantId,
        sourceSystem: 'bigcommerce',
        OR: [
          { externalReferenceId: String(rawOrder?.id || '') },
          { orderId: String(rawOrder?.order_number || rawOrder?.id || '') }
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
      sourceSystem: 'bigcommerce',
      channel: String(canonical.channel || 'online'),
      lifecycleState: String(canonical.lifecycleState),
      normalizedStatus: String(canonical.lifecycleState),
      currency: String(canonical.currency || 'USD'),
      totalAmount: Number(canonical.totalAmount || 0),
      taxAmount: Number(canonical.taxAmount || 0),
      discountAmount: Number(canonical.discountAmount || 0),
      paidAmount: Number(canonical.paidAmount || 0),
      refundedAmount: Number(canonical.refundedAmount || 0),
      placedAt: new Date(canonical.placedAt),
      paidAt: rawOrder?.date_paid ? new Date(rawOrder.date_paid) : null,
      shippedAt: rawOrder?.date_shipped ? new Date(rawOrder.date_shipped) : null,
      deliveredAt: null,
      mappingVersion: 'bigcommerce/v1',
      metadata: {
        ...(canonical.metadata || {}),
        connectorInstanceId: instance.id,
        connectorLabel: instance.label,
        connectorStoreUrl: (() => {
          const config = (instance.syncConfig || {}) as Record<string, any>;
          const rawStoreUrl = String(config.storeUrl || '').trim();
          if (rawStoreUrl) return rawStoreUrl;

          const storeHash = String(config.storeHash || config.store_hash || '').trim();
          return storeHash ? `https://store-${storeHash}.mybigcommerce.com` : null;
        })(),
        bigcommerceOrder: rawOrder
      } as Prisma.InputJsonValue,
      updatedAt: new Date()
    };

    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.canonicalOrder.update({ where: { id: existing.id }, data });
      });

      return 'updated';
    }

    const newId = crypto.randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.canonicalOrder.create({ data: { id: newId, ...data } });
      await tx.orderSnapshot.create({
        data: {
          orderInternalId: newId,
          projectId: instance.siteId,
          connectorInstanceId: instance.id,
          lifecycleState: String(canonical.lifecycleState),
          totalAmount: Number(canonical.totalAmount || 0),
          metadata: {
            syncSource: 'bigcommerce',
            connectorInstanceId: instance.id
          } as Prisma.InputJsonValue
        }
      });
      await tx.orderEvent.create({
        data: {
          id: crypto.randomUUID(),
          orderInternalId: newId,
          projectId: instance.siteId,
          connectorInstanceId: instance.id,
          eventType: 'BIGCOMMERCE_SYNC_IMPORT',
          timestamp: new Date(),
          payload: rawOrder as Prisma.InputJsonValue,
          correlationId: instance.id
        }
      });
    });

    return 'created';
  }

  private static resolveBaseUrl(config: Record<string, any>): string {
    const storeHash = String(config.storeHash || config.store_hash || '').trim();
    const baseUrl = String(config.baseUrl || '').trim().replace(/\/+$/, '');
    
    // Always prioritize storeHash for API calls (correct API endpoint)
    if (storeHash) return `https://api.bigcommerce.com/stores/${storeHash}`;
    // Fallback to baseUrl only if storeHash is not available (for backward compatibility)
    // but warn that it might not work if it's a storefront URL
    if (baseUrl && baseUrl.includes('api.bigcommerce.com')) return baseUrl;
    return '';
  }

  private static parseCredentials(encryptedSecret: any): Record<string, any> {
    // Decrypts the AES-256-GCM envelope in memory (with legacy-plaintext fallback).
    // Never log the returned credentials.
    return decryptSecret(encryptedSecret);
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
      console.error('[BigCommerceOrderSyncService] Failed to log lifecycle event', { err });
    }
  }
}

export default BigCommerceOrderSyncService;
