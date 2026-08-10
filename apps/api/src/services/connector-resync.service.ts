import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, hashEmail, hashPhone, encryptEmail, scrubEmails, decryptSecret } from '@kpi-platform/db';
import { getDataPlaneClient } from '../lib/tenant-prisma';
import { ShopifyOrderSyncService } from './shopify-order-sync.service';
import { AdobeCommerceOrderSyncService } from './adobe-commerce-order-sync.service';
import { BigCommerceOrderSyncService } from './bigcommerce-order-sync.service';
import { ShopifyCustomerSyncService } from './shopify-customer-sync.service';
import { AdobeCommerceCustomerSyncService } from './adobe-commerce-customer-sync.service';
import { ShopifyProductSyncService } from './shopify-product-sync.service';
import { CustomerMetricsService } from './customer-metrics.service';
import { BehavioralFusionService } from './behavioral-fusion.service';

type ResyncTarget = 'orders' | 'customers' | 'products';

type ConnectorContext = {
  id: string;
  tenantId: string;
  siteId: string;
  providerId: 'shopify' | 'adobe_commerce' | 'bigcommerce';
  label: string;
  syncConfig: Record<string, any>;
  credentials: Record<string, any>;
};

type ResyncJobState = {
  jobId: string;
  connectorInstanceId: string;
  projectId: string;
  tenantId: string;
  syncTargets: ResyncTarget[];
  status: 'queued' | 'running' | 'completed' | 'failed';
  initiatedAt: Date;
  completedAt: Date | null;
  error: Prisma.JsonValue | null;
  targetResults: Prisma.JsonValue | null;
};

type TargetSummary = {
  status: 'completed' | 'failed';
  fetched: number;
  upserted: number;
  failed: number;
  error?: string | null;
};

const SHOPIFY_API_VERSION = '2024-01';
const SHOPIFY_RATE_LIMIT_DELAY_MS = 550;
const ADOBE_RATE_LIMIT_DELAY_MS = 250;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ConnectorResyncService {
  static async enqueueResyncJob(input: {
    tenantId: string;
    projectId: string;
    connectorInstanceId: string;
    syncTargets: Array<string>;
  }): Promise<ResyncJobState> {
    const syncTargets = this.normalizeTargets(input.syncTargets);
    const connector = await this.loadConnectorContext({
      tenantId: input.tenantId,
      projectId: input.projectId,
      connectorInstanceId: input.connectorInstanceId
    });

    if (!connector) {
      throw this.createHttpError(404, 'Integration instance not found for the specified project.');
    }

    if (!['shopify', 'adobe_commerce', 'bigcommerce'].includes(connector.providerId)) {
      throw this.createHttpError(400, `Re-sync is not supported for provider '${connector.providerId}'.`);
    }

    const activeJob = await prisma.connectorResyncJob.findFirst({
      where: {
        connectorInstanceId: connector.id,
        status: { in: ['queued', 'running'] }
      },
      select: { jobId: true }
    });

    if (activeJob) {
      throw this.createHttpError(409, 'A re-sync job is already active for this connector.');
    }

    const jobId = `resync_job_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const initiatedAt = new Date();

    const job = await prisma.connectorResyncJob.create({
      data: {
        jobId,
        connectorInstanceId: connector.id,
        projectId: connector.siteId,
        tenantId: connector.tenantId,
        syncTargets: syncTargets as unknown as Prisma.InputJsonValue,
        status: 'queued',
        initiatedAt,
        error: Prisma.JsonNull,
        targetResults: Prisma.JsonNull
      }
    });

    setImmediate(() => {
      void this.runResyncJob(job.jobId).catch((error) => {
        console.error('[ConnectorResyncService] Background re-sync failed to start', {
          jobId: job.jobId,
          error: error?.message || error
        });
      });
    });

    return this.mapJob(job as any);
  }

  static async getResyncJob(input: {
    tenantId: string;
    projectId: string;
    connectorInstanceId: string;
    jobId: string;
  }): Promise<ResyncJobState | null> {
    const job = await prisma.connectorResyncJob.findFirst({
      where: {
        jobId: input.jobId,
        connectorInstanceId: input.connectorInstanceId,
        tenantId: input.tenantId,
        projectId: input.projectId
      }
    });

    return job ? this.mapJob(job as any) : null;
  }

  /**
   * Runs a product (+ derived category) sync for a single connector instance, resolving its
   * own tenant/project context. Used by the initial post-connect setup so products sync on
   * connect across every provider. Returns the same summary shape the entity sync services do
   * ({ fetched, created, updated, failed }) so callers can treat it uniformly.
   */
  static async syncProductsForInstance(connectorInstanceId: string): Promise<{ fetched: number; created: number; updated: number; failed: number }> {
    const instance = await prisma.connectorInstance.findUnique({
      where: { id: connectorInstanceId },
      select: { id: true, tenantId: true, siteId: true, providerId: true }
    });

    if (!instance) {
      throw new Error('Integration instance not found.');
    }

    if (!['shopify', 'adobe_commerce', 'bigcommerce'].includes(instance.providerId)) {
      throw new Error(`Product sync is not supported for provider '${instance.providerId}'.`);
    }

    const connector = await this.loadConnectorContext({
      tenantId: instance.tenantId,
      projectId: instance.siteId,
      connectorInstanceId
    });

    if (!connector) {
      throw new Error('Integration instance not found.');
    }

    const summary =
      connector.providerId === 'shopify'
        ? await this.syncShopifyTarget(connector, 'products')
        : connector.providerId === 'adobe_commerce'
          ? await this.syncAdobeTarget(connector, 'products')
          : await this.syncBigCommerceTarget(connector, 'products');

    // TargetSummary ({ status, fetched, upserted, failed }) → entity-summary shape.
    return {
      fetched: summary.fetched,
      created: summary.upserted,
      updated: 0,
      failed: summary.failed
    };
  }

  private static async runResyncJob(jobId: string): Promise<void> {
    console.log('[ConnectorResyncService] Starting re-sync job', { jobId });

    const job = await prisma.connectorResyncJob.findUnique({
      where: { jobId }
    });

    if (!job) {
      console.warn('[ConnectorResyncService] Job not found in database', { jobId });
      return;
    }

    const connector = await this.loadConnectorContext({
      tenantId: job.tenantId,
      projectId: job.projectId,
      connectorInstanceId: job.connectorInstanceId
    });

    if (!connector) {
      console.error('[ConnectorResyncService] Failed to load connector context', { jobId });
      await prisma.connectorResyncJob.update({
        where: { jobId },
        data: {
          status: 'failed',
          completedAt: new Date(),
          error: { message: 'Integration instance no longer exists.' } as Prisma.InputJsonValue,
          targetResults: { general: { status: 'failed', error: 'Integration instance no longer exists.' } } as Prisma.InputJsonValue
        }
      });
      return;
    }

    try {
      // Mark as running
      await prisma.connectorResyncJob.update({
        where: { jobId },
        data: { status: 'running' }
      });

      const startedAt = new Date();
      const targetResults: Record<string, TargetSummary> = {};
      const successfulCounts: Record<string, number> = {};
      const failedTargets: string[] = [];

      console.log('[ConnectorResyncService] Processing sync targets', {
        jobId,
        targets: job.syncTargets,
        provider: connector.providerId
      });

      for (const target of job.syncTargets as unknown as ResyncTarget[]) {
        try {
          const summary =
            connector.providerId === 'shopify'
              ? await this.syncShopifyTarget(connector, target)
              : connector.providerId === 'adobe_commerce'
                ? await this.syncAdobeTarget(connector, target)
                : await this.syncBigCommerceTarget(connector, target);

          targetResults[target] = summary;
          successfulCounts[target] = summary.upserted;
          console.log('[ConnectorResyncService] Target sync completed', {
            jobId,
            target,
            ...summary
          });
        } catch (error: any) {
          const message = error?.message || `Failed to sync ${target}.`;
          targetResults[target] = {
            status: 'failed',
            fetched: 0,
            upserted: 0,
            failed: 0,
            error: message
          };
          failedTargets.push(target);
          console.error('[ConnectorResyncService] Target sync failed', {
            jobId,
            target,
            error: message,
            stack: error?.stack
          });
        }
      }

      const completedAt = new Date();
      const status = failedTargets.length > 0 ? 'failed' : 'completed';
      const errorPayload = failedTargets.length > 0
        ? ({
            message: 'One or more sync targets failed.',
            failedTargets,
            details: targetResults
          } as Prisma.InputJsonValue)
        : Prisma.JsonNull;

      console.log('[ConnectorResyncService] Re-sync job completed', {
        jobId,
        status,
        failedTargets,
        results: targetResults
      });

      await prisma.$transaction(async (tx) => {
        await tx.connectorResyncJob.update({
          where: { jobId },
          data: {
            status,
            completedAt,
            error: errorPayload,
            targetResults: targetResults as unknown as Prisma.InputJsonValue
          }
        });

        const connectorRecord = await tx.connectorInstance.findUnique({
          where: { id: connector.id },
          select: { recordsByType: true }
        });

        const existingCounts = this.parseRecordsByType(connectorRecord?.recordsByType);
        const nextCounts = {
          ...existingCounts,
          ...(successfulCounts.orders !== undefined ? { orders: successfulCounts.orders } : {}),
          ...(successfulCounts.customers !== undefined ? { customers: successfulCounts.customers } : {}),
          ...(successfulCounts.products !== undefined ? { products: successfulCounts.products } : {})
        };

        await tx.connectorInstance.update({
          where: { id: connector.id },
          data: {
            lastAttemptAt: startedAt,
            lastSyncAt: completedAt,
            healthStatus: failedTargets.length > 0 ? 'DEGRADED' : 'HEALTHY',
            status: failedTargets.length > 0 ? 'DEGRADED' : 'ACTIVE',
            lifecycleState: failedTargets.length > 0 ? 'DEGRADED' : 'ACTIVE',
            lastError: failedTargets.length > 0 ? errorPayload : Prisma.JsonNull,
            recordsByType: nextCounts as unknown as Prisma.InputJsonValue
          }
        });
      });

      // CDP: refresh order-derived analytics (RFM/CLTV/churn/segment) now that
      // order/customer data has changed. Event-driven — the correct cadence, since
      // these metrics only change when order history does (not on a UI timer).
      // Best-effort: a failure here must never fail the sync job.
      if (successfulCounts.orders !== undefined || successfulCounts.customers !== undefined) {
        try {
          const db = await getDataPlaneClient(connector.id);
          const scope = { siteId: connector.siteId, connectorInstanceId: connector.id };
          const metrics = await CustomerMetricsService.recomputeForConnector(db, scope);
          const fusion = await BehavioralFusionService.recomputeForConnector(db, scope);
          console.log('[ConnectorResyncService] Metrics + fusion auto-recomputed', { jobId, ...metrics, fusedSnapshots: fusion.profilesSnapshotted });
        } catch (err: any) {
          console.error('[ConnectorResyncService] Metrics auto-recompute failed (non-fatal)', { jobId, error: err?.message });
        }
      }
    } catch (error: any) {
      const completedAt = new Date();
      const message = error?.message || 'Unexpected re-sync failure.';
      const stack = error?.stack || '';

      console.error('[ConnectorResyncService] Worker failure', {
        jobId,
        message,
        stack
      });

      try {
        await prisma.connectorResyncJob.update({
          where: { jobId },
          data: {
            status: 'failed',
            completedAt,
            error: { message, stack } as Prisma.InputJsonValue,
            targetResults: {
              general: {
                status: 'failed',
                error: message
              }
            } as Prisma.InputJsonValue
          }
        });

        await prisma.connectorInstance.update({
          where: { id: connector.id },
          data: {
            lastAttemptAt: completedAt,
            healthStatus: 'DEGRADED',
            status: 'DEGRADED',
            lifecycleState: 'DEGRADED',
            lastError: { message } as Prisma.InputJsonValue
          }
        });
      } catch (updateError: any) {
        console.error('[ConnectorResyncService] Failed to update job/connector status after error', {
          jobId,
          updateError: updateError?.message
        });
      }
    }
  }

  private static async syncShopifyTarget(connector: ConnectorContext, target: ResyncTarget): Promise<TargetSummary> {
    console.log('[ConnectorResyncService] Syncing Shopify target', {
      connectorId: connector.id,
      target
    });

    if (target === 'orders') {
      const summary = await ShopifyOrderSyncService.syncConnectorInstance(connector.id);
      return this.mapSyncSummary(summary);
    }

    if (target === 'products') {
      const summary = await ShopifyProductSyncService.syncConnectorInstance(connector.id);
      return this.mapSyncSummary(summary);
    }

    const summary = await ShopifyCustomerSyncService.syncConnectorInstance(connector.id);
    return this.mapSyncSummary(summary);
  }

  private static async syncAdobeTarget(connector: ConnectorContext, target: ResyncTarget): Promise<TargetSummary> {
    console.log('[ConnectorResyncService] Syncing Adobe Commerce target', {
      connectorId: connector.id,
      target
    });

    if (target === 'orders') {
      const summary = await AdobeCommerceOrderSyncService.syncConnectorInstance(connector.id);
      return this.mapSyncSummary(summary);
    }

    if (target === 'products') {
      const config = connector.syncConfig || {};
      const credentials = connector.credentials || {};
      const storeUrl = String(config.storeUrl || config.baseUrl || '').trim();
      const accessToken = String(
        credentials.adminApiAccessToken || credentials.adminApiToken || credentials.accessToken || credentials.token || credentials.apiKey || ''
      ).trim();

      if (!storeUrl) {
        throw new Error('Adobe Commerce integration is missing storeUrl in syncConfig.');
      }
      if (!accessToken) {
        throw new Error('Adobe Commerce integration is missing accessToken credentials.');
      }

      return this.syncAdobeProducts({ connector, baseUrl: storeUrl.replace(/\/+$/, ''), accessToken });
    }

    const summary = await AdobeCommerceCustomerSyncService.syncConnectorInstance(connector.id);
    return this.mapSyncSummary(summary);
  }

  private static async syncBigCommerceTarget(connector: ConnectorContext, target: ResyncTarget): Promise<TargetSummary> {
    const config = connector.syncConfig || {};
    const credentials = connector.credentials || {};
    // BigCommerce typically uses a store hash and an access token
    const storeHash = String(config.storeHash || config.store_hash || '').trim();
    const accessToken = String(credentials.accessToken || credentials.token || credentials.storeApiToken || '').trim();
    const baseUrl = storeHash ? `https://api.bigcommerce.com/stores/${storeHash}` : String(config.baseUrl || '').trim().replace(/\/+$/, '');

    console.log('[ConnectorResyncService] Syncing BigCommerce target', {
      connectorId: connector.id,
      target,
      storeHash,
      baseUrl,
      hasAccessToken: Boolean(accessToken)
    });

    if (!storeHash && !baseUrl) {
      throw new Error('BigCommerce integration is missing storeHash or baseUrl in syncConfig.');
    }

    if (!accessToken) {
      throw new Error('BigCommerce integration is missing access token credentials.');
    }

    if (target === 'orders') {
      const summary = await BigCommerceOrderSyncService.syncConnectorInstance(connector.id);
      return this.mapSyncSummary(summary);
    }

    if (target === 'products') {
      return this.syncBigCommerceProducts({ connector, baseUrl, storeHash, accessToken });
    }

    return this.syncBigCommerceCustomers({ connector, baseUrl, storeHash, accessToken });
  }

  private static async syncBigCommerceCustomers(input: { connector: ConnectorContext; baseUrl: string; storeHash: string; accessToken: string; }): Promise<TargetSummary> {
    // DATA-PLANE routing: customer profiles live in the integration's physical store DB.
    const db = await getDataPlaneClient(input.connector.id);
    const pageSize = 100;
    let page = 1;
    const items: any[] = [];

    while (true) {
      const url = `${input.baseUrl}/v3/customers?limit=${pageSize}&page=${page}`;
      const resp = await this.fetchBigCommerceJson(url, input.accessToken);
      const data = Array.isArray(resp?.data) ? resp.data : [];
      items.push(...data);
      if (!resp?.meta || !resp.meta.pagination || (resp.meta.pagination.total_pages || 0) <= page) break;
      page += 1;
      await delay(ADOBE_RATE_LIMIT_DELAY_MS);
    }

    let upserted = 0;
    let failed = 0;
    for (const raw of items) {
      try {
        await this.upsertCustomer(db, input.connector, 'bigcommerce', raw);
        upserted += 1;
      } catch (err) {
        failed += 1;
        console.error('[ConnectorResyncService] BigCommerce customer upsert failed', { connectorInstanceId: input.connector.id, customerId: raw?.id, error: err });
      }
    }

    return {
      status: failed > 0 ? 'failed' : 'completed',
      fetched: items.length,
      upserted,
      failed,
      error: failed > 0 ? `${failed} BigCommerce customer record(s) failed.` : null
    };
  }

  private static async syncBigCommerceProducts(input: { connector: ConnectorContext; baseUrl: string; storeHash: string; accessToken: string; }): Promise<TargetSummary> {
    // DATA-PLANE routing: canonical products/categories live in the integration's physical store DB.
    const db = await getDataPlaneClient(input.connector.id);
    const pageSize = 100;
    let page = 1;
    const items: any[] = [];

    while (true) {
      const url = `${input.baseUrl}/v3/catalog/products?limit=${pageSize}&page=${page}`;
      const resp = await this.fetchBigCommerceJson(url, input.accessToken);
      const data = Array.isArray(resp?.data) ? resp.data : [];
      items.push(...data);
      if (!resp?.meta || !resp.meta.pagination || (resp.meta.pagination.total_pages || 0) <= page) break;
      page += 1;
      await delay(ADOBE_RATE_LIMIT_DELAY_MS);
    }

    let upserted = 0;
    let failed = 0;
    for (const raw of items) {
      try {
        await this.upsertProduct(db, input.connector, 'bigcommerce', raw);
        upserted += 1;
      } catch (err) {
        failed += 1;
        console.error('[ConnectorResyncService] BigCommerce product upsert failed', { connectorInstanceId: input.connector.id, productId: raw?.id, error: err });
      }
    }

    return {
      status: failed > 0 ? 'failed' : 'completed',
      fetched: items.length,
      upserted,
      failed,
      error: failed > 0 ? `${failed} BigCommerce product record(s) failed.` : null
    };
  }

  private static async fetchBigCommerceJson(url: string, accessToken: string): Promise<any> {
    if (!fetch) throw new Error('Fetch API is not available in this environment.');
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Auth-Token': accessToken,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const body = await response.text();
        const errorMsg = `BigCommerce API request failed (${response.status}): ${body || response.statusText}`;
        console.error('[ConnectorResyncService] BigCommerce API error', { status: response.status, url, body });
        throw new Error(errorMsg);
      }

      return await response.json();
    } catch (error: any) {
      console.error('[ConnectorResyncService] BigCommerce fetch error', { url, error: error?.message });
      throw error;
    }
  }

  private static async syncShopifyCustomers(input: {
    connector: ConnectorContext;
    shopDomain: string;
    accessToken: string;
    apiVersion: string;
  }): Promise<TargetSummary> {
    const customers = await this.fetchShopifyPaginatedResources({
      shopDomain: input.shopDomain,
      accessToken: input.accessToken,
      apiVersion: input.apiVersion,
      resource: 'customers'
    });

    // DATA-PLANE routing: customer profiles live in the integration's physical store DB.
    const db = await getDataPlaneClient(input.connector.id);

    let upserted = 0;
    let failed = 0;

    for (const rawCustomer of customers) {
      try {
        await this.upsertCustomer(db, input.connector, 'shopify', rawCustomer);
        upserted += 1;
      } catch (error) {
        failed += 1;
        console.error('[ConnectorResyncService] Shopify customer upsert failed', {
          connectorInstanceId: input.connector.id,
          customerId: rawCustomer?.id,
          error
        });
      }
    }

    return {
      status: failed > 0 ? 'failed' : 'completed',
      fetched: customers.length,
      upserted,
      failed,
      error: failed > 0 ? `${failed} Shopify customer record(s) failed.` : null
    };
  }

  private static async syncShopifyProducts(input: {
    connector: ConnectorContext;
    shopDomain: string;
    accessToken: string;
    apiVersion: string;
  }): Promise<TargetSummary> {
    const products = await this.fetchShopifyPaginatedResources({
      shopDomain: input.shopDomain,
      accessToken: input.accessToken,
      apiVersion: input.apiVersion,
      resource: 'products'
    });

    // DATA-PLANE routing: canonical products/categories live in the integration's physical store DB.
    const db = await getDataPlaneClient(input.connector.id);

    let upserted = 0;
    let failed = 0;

    for (const rawProduct of products) {
      try {
        await this.upsertProduct(db, input.connector, 'shopify', rawProduct);
        upserted += 1;
      } catch (error) {
        failed += 1;
        console.error('[ConnectorResyncService] Shopify product upsert failed', {
          connectorInstanceId: input.connector.id,
          productId: rawProduct?.id,
          error
        });
      }
    }

    return {
      status: failed > 0 ? 'failed' : 'completed',
      fetched: products.length,
      upserted,
      failed,
      error: failed > 0 ? `${failed} Shopify product record(s) failed.` : null
    };
  }

  private static async syncAdobeCustomers(input: {
    connector: ConnectorContext;
    baseUrl: string;
    accessToken: string;
  }): Promise<TargetSummary> {
    const pageSize = 200;
    let currentPage = 1;
    let totalPages = 1;
    const items: any[] = [];

    while (currentPage <= totalPages) {
      const response = await this.fetchJson(`${input.baseUrl}/rest/V1/customers/search?searchCriteria[pageSize]=${pageSize}&searchCriteria[currentPage]=${currentPage}`, input.accessToken);
      const pageItems = Array.isArray(response?.items) ? response.items : [];
      items.push(...pageItems);
      const totalCount = Number(response?.total_count || pageItems.length || 0);
      totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      currentPage += 1;

      if (currentPage <= totalPages) {
        await delay(ADOBE_RATE_LIMIT_DELAY_MS);
      }
    }

    // DATA-PLANE routing: customer profiles live in the integration's physical store DB.
    const db = await getDataPlaneClient(input.connector.id);

    let upserted = 0;
    let failed = 0;

    for (const rawCustomer of items) {
      try {
        await this.upsertCustomer(db, input.connector, 'adobe_commerce', rawCustomer);
        upserted += 1;
      } catch (error) {
        failed += 1;
        console.error('[ConnectorResyncService] Adobe customer upsert failed', {
          connectorInstanceId: input.connector.id,
          customerId: rawCustomer?.id,
          error
        });
      }
    }

    return {
      status: failed > 0 ? 'failed' : 'completed',
      fetched: items.length,
      upserted,
      failed,
      error: failed > 0 ? `${failed} Adobe Commerce customer record(s) failed.` : null
    };
  }

  private static async syncAdobeProducts(input: {
    connector: ConnectorContext;
    baseUrl: string;
    accessToken: string;
  }): Promise<TargetSummary> {
    const pageSize = 200;
    let currentPage = 1;
    let totalPages = 1;
    const items: any[] = [];

    while (currentPage <= totalPages) {
      const response = await this.fetchJson(`${input.baseUrl}/rest/V1/products?searchCriteria[pageSize]=${pageSize}&searchCriteria[currentPage]=${currentPage}`, input.accessToken);
      const pageItems = Array.isArray(response?.items) ? response.items : [];
      items.push(...pageItems);
      const totalCount = Number(response?.total_count || pageItems.length || 0);
      totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      currentPage += 1;

      if (currentPage <= totalPages) {
        await delay(ADOBE_RATE_LIMIT_DELAY_MS);
      }
    }

    // DATA-PLANE routing: canonical products/categories live in the integration's physical store DB.
    const db = await getDataPlaneClient(input.connector.id);

    let upserted = 0;
    let failed = 0;

    for (const rawProduct of items) {
      try {
        await this.upsertProduct(db, input.connector, 'adobe_commerce', rawProduct);
        upserted += 1;
      } catch (error) {
        failed += 1;
        console.error('[ConnectorResyncService] Adobe product upsert failed', {
          connectorInstanceId: input.connector.id,
          productId: rawProduct?.id || rawProduct?.sku,
          error
        });
      }
    }

    return {
      status: failed > 0 ? 'failed' : 'completed',
      fetched: items.length,
      upserted,
      failed,
      error: failed > 0 ? `${failed} Adobe Commerce product record(s) failed.` : null
    };
  }

  private static async fetchShopifyPaginatedResources(input: {
    shopDomain: string;
    accessToken: string;
    apiVersion: string;
    resource: 'customers' | 'products';
  }): Promise<any[]> {
    const normalizedShopDomain = this.normalizeShopDomain(input.shopDomain);
    const baseUrl = `https://${normalizedShopDomain}/admin/api/${input.apiVersion}`;
    
    if (!fetch) {
      throw new Error('Fetch API is not available in this environment.');
    }

    const records: any[] = [];
    let nextUrl: string | null = `${baseUrl}/${input.resource}.json?limit=250`;
    let pageCount = 0;

    console.log('[ConnectorResyncService] Starting Shopify pagination', {
      baseUrl,
      resource: input.resource,
      initialUrl: nextUrl
    });

    while (nextUrl) {
      pageCount += 1;
      try {
        console.log('[ConnectorResyncService] Fetching Shopify page', { page: pageCount, url: nextUrl });
        
        const response = await fetch(nextUrl, {
          method: 'GET',
          headers: {
            'X-Shopify-Access-Token': input.accessToken,
            Accept: 'application/json',
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const body = await response.text();
          const errorMsg = `Shopify API request failed (${response.status}): ${body || response.statusText}`;
          console.error('[ConnectorResyncService] Shopify API error', { 
            status: response.status,
            body,
            resource: input.resource
          });
          throw new Error(errorMsg);
        }

        const payload = await response.json();
        const pageRecords = Array.isArray(payload?.[input.resource]) ? payload[input.resource] : [];
        records.push(...pageRecords);
        
        console.log('[ConnectorResyncService] Fetched Shopify page', {
          page: pageCount,
          recordsInPage: pageRecords.length,
          totalRecords: records.length,
          resource: input.resource
        });

        const linkHeader = response.headers.get('link') || response.headers.get('Link');
        nextUrl = this.extractNextLink(linkHeader);

        if (nextUrl) {
          await delay(SHOPIFY_RATE_LIMIT_DELAY_MS);
        }
      } catch (error: any) {
        console.error('[ConnectorResyncService] Shopify fetch error', {
          page: pageCount,
          error: error?.message,
          resource: input.resource
        });
        throw error;
      }
    }

    console.log('[ConnectorResyncService] Shopify pagination complete', {
      totalPages: pageCount,
      totalRecords: records.length,
      resource: input.resource
    });

    return records;
  }

  private static async fetchJson(url: string, accessToken: string): Promise<any> {
    if (!fetch) {
      throw new Error('Fetch API is not available in this environment.');
    }

    console.log('[ConnectorResyncService] Fetching from Adobe Commerce', { url });

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const body = await response.text();
        const errorMsg = `Adobe Commerce API request failed (${response.status}): ${body || response.statusText}`;
        console.error('[ConnectorResyncService] Adobe API error', { 
          status: response.status,
          url,
          body
        });
        throw new Error(errorMsg);
      }

      const data = await response.json();
      console.log('[ConnectorResyncService] Adobe Commerce fetch successful', { url });
      return data;
    } catch (error: any) {
      console.error('[ConnectorResyncService] Adobe fetch error', {
        url,
        error: error?.message
      });
      throw error;
    }
  }

  private static async upsertCustomer(
    db: any,
    connector: ConnectorContext,
    sourceSystem: 'shopify' | 'adobe_commerce' | 'bigcommerce',
    rawCustomer: any
  ): Promise<void> {
    const externalId = String(rawCustomer?.id || rawCustomer?.entity_id || '').trim();
    if (!externalId) {
      throw new Error('Customer record is missing an external identifier.');
    }

    const email = String(rawCustomer?.email || '').trim().toLowerCase();
    const phone = String(rawCustomer?.phone || rawCustomer?.telephone || rawCustomer?.addresses?.[0]?.telephone || '').trim();
    const existing = await db.customerProfile.findFirst({
      where: {
        siteId: connector.siteId,
        externalIds: {
          path: [sourceSystem],
          equals: externalId
        }
      },
      select: { id: true }
    });

    const emailHashValue = hashEmail(email);
    const phoneHashValue = hashPhone(phone);
    // Raw email/phone are NOT stored in metadata — they live only in emailHash/phoneHash.
    // scrubEmails() deep-scrubs the captured `rawCustomer` and `addresses`, which can
    // otherwise carry plaintext emails nested several levels down.
    const metadata = scrubEmails({
      connectorInstanceId: connector.id,
      connectorLabel: connector.label,
      sourceSystem,
      rawCustomer,
      lastSyncedAt: new Date().toISOString(),
      firstName: rawCustomer?.first_name || rawCustomer?.firstname || null,
      lastName: rawCustomer?.last_name || rawCustomer?.lastname || null,
      orders: rawCustomer?.orders_count ?? 0,
      orderCount: rawCustomer?.orders_count ?? 0,
      tags: rawCustomer?.tags || [],
      addresses: rawCustomer?.addresses || [],
      isSubscribed: rawCustomer?.is_subscribed || false
    }) as Prisma.InputJsonValue;

    const payload: Prisma.CustomerProfileUncheckedCreateInput = {
      id: existing?.id || crypto.randomUUID(),
      siteId: connector.siteId,
      connectorInstanceId: connector.id,
      externalIds: {
        [sourceSystem]: externalId
      } as Prisma.InputJsonValue,
      emailHash: emailHashValue || undefined,
      // Reversible, encrypted-at-rest copy for dashboard display.
      emailEncrypted: encryptEmail(email) || undefined,
      phoneHash: phoneHashValue || undefined,
      lifecycleState: sourceSystem === 'shopify'
        ? (Array.isArray(rawCustomer?.tags) && rawCustomer.tags.includes('vip') ? 'VIP' : 'RETURNING')
        : (rawCustomer?.is_subscribed ? 'RETURNING' : 'NEW_GUEST'),
      firstSeenAt: new Date(rawCustomer?.created_at || rawCustomer?.createdAt || new Date()),
      lastSeenAt: new Date(rawCustomer?.updated_at || rawCustomer?.updatedAt || new Date()),
      totalLtv: sourceSystem === 'shopify'
        ? (rawCustomer?.total_spent ? Number(rawCustomer.total_spent) : null)
        : null,
      metadata
    };

    if (existing) {
      await db.customerProfile.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: payload.lastSeenAt,
          totalLtv: payload.totalLtv ?? undefined,
          // Backfill the connector instance + encrypted email on existing rows.
          connectorInstanceId: connector.id,
          emailHash: emailHashValue || undefined,
          emailEncrypted: encryptEmail(email) || undefined,
          phoneHash: phoneHashValue || undefined,
          lifecycleState: payload.lifecycleState,
          metadata: payload.metadata
        }
      });
      return;
    }

    await db.customerProfile.create({
      data: payload
    });
  }

  private static async upsertProduct(
    db: any,
    connector: ConnectorContext,
    sourceSystem: 'shopify' | 'adobe_commerce' | 'bigcommerce',
    rawProduct: any
  ): Promise<void> {
    const externalId = String(rawProduct?.id || rawProduct?.entity_id || rawProduct?.sku || '').trim();
    if (!externalId) {
      throw new Error('Product record is missing an external identifier.');
    }

    const name = String(rawProduct?.title || rawProduct?.name || rawProduct?.sku || externalId).trim();
    const sku = String(rawProduct?.sku || rawProduct?.handle || rawProduct?.product_number || externalId).trim();
    const inventoryValue = Number(
      rawProduct?.inventory_quantity ??
      rawProduct?.qty ??
      rawProduct?.inventory_level ??
      rawProduct?.stock_qty ??
      rawProduct?.extension_attributes?.stock_item?.qty ??
      rawProduct?.extension_attributes?.quantity_and_stock_status?.qty ??
      0
    );
    const priceValue = Number(rawProduct?.price ?? rawProduct?.final_price ?? rawProduct?.regular_price ?? 0);
    const sourceUpdatedAt = new Date(rawProduct?.updated_at || rawProduct?.updatedAt || rawProduct?.date_modified || new Date());

    const metadata = {
      sourceSystem,
      sku,
      status: rawProduct?.status ?? null,
      productType: rawProduct?.product_type ?? rawProduct?.type ?? null,
      vendor: rawProduct?.vendor ?? rawProduct?.brand ?? null,
      connectorInstanceId: connector.id,
      connectorLabel: connector.label,
      lastSyncedAt: new Date().toISOString()
    } as Prisma.InputJsonValue;

    const existing = await db.canonicalProduct.findUnique({
      where: {
        siteId_sourceSystem_productId: {
          siteId: connector.siteId,
          sourceSystem,
          productId: externalId
        }
      },
      select: { id: true }
    });

    if (existing) {
      await db.canonicalProduct.update({
        where: { id: existing.id },
        data: {
          name,
          sku: sku || undefined,
          inventory: Number.isFinite(inventoryValue) ? inventoryValue : 0,
          price: Number.isFinite(priceValue) ? new Prisma.Decimal(priceValue) : undefined,
          sourceUpdatedAt: Number.isNaN(sourceUpdatedAt.getTime()) ? undefined : sourceUpdatedAt,
          connectorInstanceId: connector.id,
          metadata
        }
      });
    } else {
      await db.canonicalProduct.create({
        data: {
          id: crypto.randomUUID(),
          siteId: connector.siteId,
          connectorInstanceId: connector.id,
          productId: externalId,
          sourceSystem,
          name,
          sku: sku || undefined,
          inventory: Number.isFinite(inventoryValue) ? inventoryValue : 0,
          price: Number.isFinite(priceValue) ? new Prisma.Decimal(priceValue) : undefined,
          sourceUpdatedAt: Number.isNaN(sourceUpdatedAt.getTime()) ? undefined : sourceUpdatedAt,
          metadata
        }
      });
    }

    await this.upsertProductCategories(db, connector, sourceSystem, externalId, rawProduct, sourceUpdatedAt);
  }

  /**
   * Extracts human-readable category names from a raw product and upserts one canonical
   * category row per (product, category). Only string category names are stored — Adobe
   * Commerce and BigCommerce expose categories as numeric IDs inline, which require a separate
   * catalog lookup to resolve to names, so those are skipped rather than stored as opaque IDs.
   */
  private static async upsertProductCategories(
    db: any,
    connector: ConnectorContext,
    sourceSystem: 'shopify' | 'adobe_commerce' | 'bigcommerce',
    productId: string,
    rawProduct: any,
    sourceUpdatedAt: Date
  ): Promise<void> {
    const names = this.extractProductCategoryNames(rawProduct);
    if (names.length === 0) {
      return;
    }

    const validSourceUpdatedAt = Number.isNaN(sourceUpdatedAt.getTime()) ? undefined : sourceUpdatedAt;

    for (let i = 0; i < names.length; i += 1) {
      const categoryName = names[i];
      const isPrimary = i === 0;
      try {
        await db.canonicalProductCategory.upsert({
          where: {
            siteId_sourceSystem_productId_categoryName: {
              siteId: connector.siteId,
              sourceSystem,
              productId,
              categoryName
            }
          },
          create: {
            id: crypto.randomUUID(),
            siteId: connector.siteId,
            connectorInstanceId: connector.id,
            productId,
            sourceSystem,
            categoryName,
            categoryPath: categoryName,
            isPrimary,
            sourceUpdatedAt: validSourceUpdatedAt
          },
          update: {
            connectorInstanceId: connector.id,
            categoryPath: categoryName,
            isPrimary,
            sourceUpdatedAt: validSourceUpdatedAt
          }
        });
      } catch (err) {
        console.error('[ConnectorResyncService] Product category upsert failed', {
          connectorInstanceId: connector.id,
          productId,
          categoryName,
          error: err
        });
      }
    }
  }

  private static extractProductCategoryNames(rawProduct: any): string[] {
    const names: string[] = [];
    const push = (value: unknown) => {
      const name = String(value ?? '').trim();
      if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) {
        names.push(name);
      }
    };

    // Primary: Shopify product_type / generic type field.
    push(rawProduct?.product_type ?? rawProduct?.type);

    // `categories` may be an array of strings, or of objects with a `name`. Numeric-ID-only
    // arrays (Adobe/BigCommerce) are ignored here — they need a catalog lookup for names.
    const rawCategories = rawProduct?.categories;
    if (Array.isArray(rawCategories)) {
      for (const entry of rawCategories) {
        if (typeof entry === 'string') {
          push(entry);
        } else if (entry && typeof entry === 'object' && (entry as any).name) {
          push((entry as any).name);
        }
      }
    } else if (typeof rawCategories === 'string') {
      rawCategories.split(',').forEach((c) => push(c));
    }

    // Shopify tags (comma-delimited string or array) double as coarse categories.
    const rawTags = rawProduct?.tags;
    if (Array.isArray(rawTags)) {
      rawTags.forEach((t) => push(t));
    } else if (typeof rawTags === 'string' && rawTags.trim()) {
      rawTags.split(',').forEach((t) => push(t));
    }

    return names;
  }

  private static extractNextLink(linkHeader: string | null): string | null {
    if (!linkHeader) {
      return null;
    }

    const nextMatch = linkHeader.split(',').find((segment) => segment.includes('rel="next"'));
    if (!nextMatch) {
      return null;
    }

    const urlMatch = nextMatch.match(/<([^>]+)>/);
    if (!urlMatch) {
      return null;
    }

    return urlMatch[1] || null;
  }

  private static parseRecordsByType(value: unknown): Record<string, number> {
    if (!value || typeof value !== 'object') {
      return { orders: 0, customers: 0, products: 0 };
    }

    return {
      orders: Number((value as Record<string, number>).orders || 0),
      customers: Number((value as Record<string, number>).customers || 0),
      products: Number((value as Record<string, number>).products || 0)
    };
  }

  private static normalizeTargets(value: Array<string>): ResyncTarget[] {
    const allowed = new Set<ResyncTarget>(['orders', 'customers', 'products']);
    const normalizedInput = Array.from(new Set((value || []).map((target) => String(target).trim().toLowerCase())));
    const invalidTargets = normalizedInput.filter((target) => !allowed.has(target as ResyncTarget));

    if (invalidTargets.length > 0) {
      throw this.createHttpError(400, `Invalid syncTargets: ${invalidTargets.join(', ')}. Allowed values are orders, customers, products.`);
    }

    const normalized = normalizedInput.filter((target): target is ResyncTarget => allowed.has(target as ResyncTarget));

    if (normalized.length === 0) {
      throw this.createHttpError(400, 'syncTargets must include at least one of: orders, customers, products.');
    }

    return normalized;
  }

  private static mapSyncSummary(summary: { fetched?: number; created?: number; updated?: number; failed?: number }): TargetSummary {
    const created = Number(summary?.created || 0);
    const updated = Number(summary?.updated || 0);
    const failed = Number(summary?.failed || 0);
    const fetched = Number(summary?.fetched || 0);

    return {
      status: failed > 0 ? 'failed' : 'completed',
      fetched,
      upserted: created + updated,
      failed,
      error: failed > 0 ? `${failed} record(s) failed during sync.` : null
    };
  }

  private static normalizeShopDomain(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }

    const withoutProtocol = raw.replace(/^https?:\/\//i, '');
    return withoutProtocol.split('/')[0].replace(/\/+$/, '').trim();
  }

  private static async loadConnectorContext(input: {
    tenantId: string;
    projectId: string;
    connectorInstanceId: string;
  }): Promise<ConnectorContext | null> {
    const instance = await prisma.connectorInstance.findFirst({
      where: {
        id: input.connectorInstanceId,
        tenantId: input.tenantId,
        siteId: input.projectId
      },
      select: {
        id: true,
        tenantId: true,
        siteId: true,
        providerId: true,
        label: true,
        syncConfig: true,
        credentials: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { encryptedSecret: true }
        }
      }
    });

    if (!instance) {
      console.warn('[ConnectorResyncService] Connector instance not found', {
        connectorInstanceId: input.connectorInstanceId,
        tenantId: input.tenantId,
        projectId: input.projectId
      });
      return null;
    }

    // Try to get credentials, with fallback to empty object
    let credentials: Record<string, any> = {};
    if (instance.credentials && instance.credentials.length > 0) {
      credentials = this.parseCredentials(instance.credentials[0]?.encryptedSecret);
    } else {
      console.warn('[ConnectorResyncService] No active credentials found for connector', {
        connectorInstanceId: instance.id
      });
    }

    const context: ConnectorContext = {
      id: instance.id,
      tenantId: instance.tenantId,
      siteId: instance.siteId,
      providerId: instance.providerId as ConnectorContext['providerId'],
      label: instance.label,
      syncConfig: (instance.syncConfig || {}) as Record<string, any>,
      credentials
    };

    console.log('[ConnectorResyncService] Loaded connector context', {
      connectorId: instance.id,
      providerId: instance.providerId,
      credentialsLoaded: Object.keys(credentials).length > 0
    });

    return context;
  }

  private static parseCredentials(serialized: unknown): Record<string, any> {
    // Decrypts the AES-256-GCM envelope in memory (with legacy-plaintext fallback).
    // Never log the returned credentials.
    return decryptSecret(serialized);
  }

  private static mapJob(job: any): ResyncJobState {
    return {
      jobId: job.jobId,
      connectorInstanceId: job.connectorInstanceId,
      projectId: job.projectId,
      tenantId: job.tenantId,
      syncTargets: Array.isArray(job.syncTargets) ? job.syncTargets : [],
      status: job.status,
      initiatedAt: job.initiatedAt,
      completedAt: job.completedAt || null,
      error: job.error ?? null,
      targetResults: job.targetResults ?? null
    };
  }

  private static createHttpError(statusCode: number, message: string): Error & { statusCode: number } {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = statusCode;
    return error;
  }
}
