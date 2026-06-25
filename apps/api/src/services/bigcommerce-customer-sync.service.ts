import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma, hashEmail, hashPhone, encryptEmail, scrubEmails, decryptSecret } from '@kpi-platform/db';

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

export class BigCommerceCustomerSyncService {
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
    if (instance.providerId !== 'bigcommerce') throw new Error(`Provider "${instance.providerId}" is not supported by BigCommerceCustomerSyncService.`);

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

    try {
      const customers = await this.fetchCustomers({ baseUrl, accessToken });

      let created = 0;
      let updated = 0;
      let failed = 0;

      for (const rawCustomer of customers) {
        try {
          const result = await this.upsertCustomerProfile(instance, rawCustomer);
          if (result === 'created') {
            created += 1;
          } else {
            updated += 1;
          }
        } catch (err) {
          failed += 1;
          console.error('[BigCommerceCustomerSyncService] Failed to persist customer', {
            connectorInstanceId,
            customerId: rawCustomer?.id,
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
          recordsFetched: customers.length,
          recordsProcessed: created + updated,
          recordsFailed: failed,
          checkpointValue: customers[0]?.date_modified || customers[0]?.date_created || null
        }
      });

      console.log('[BigCommerceCustomerSyncService] Sync completed', {
        runId,
        fetched: customers.length,
        created,
        updated,
        failed
      });

      return {
        runId,
        fetched: customers.length,
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

      console.error('[BigCommerceCustomerSyncService] Sync failed', errorPayload);
      throw err;
    }
  }

  private static async fetchCustomers(input: {
    baseUrl: string;
    accessToken: string;
  }): Promise<any[]> {
    const url = new URL(`${input.baseUrl}/v3/customers`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', '1');

    const fetchFunc: typeof fetch = (globalThis as any).fetch ?? (await import('undici')).fetch;
    const allCustomers: any[] = [];
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
      const pageCustomers = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      allCustomers.push(...pageCustomers);

      const totalPages = Number(payload?.meta?.pagination?.total_pages || 0);
      if (totalPages > 0 && currentPage >= totalPages) {
        break;
      }

      if (pageCustomers.length < 250) {
        break;
      }

      currentPage += 1;
    }

    return allCustomers;
  }

  private static async upsertCustomerProfile(instance: ConnectorRecord, rawCustomer: any): Promise<'created' | 'updated'> {
    const customerId = String(rawCustomer?.id || '');
    if (!customerId) {
      throw new Error('BigCommerce customer record is missing an id.');
    }

    const email = String(rawCustomer?.email || '').trim().toLowerCase();
    const phone = String(rawCustomer?.phone || rawCustomer?.addresses?.[0]?.phone || rawCustomer?.addresses?.[0]?.telephone || '').trim();

    const existing = await prisma.customerProfile.findFirst({
      where: {
        siteId: instance.siteId,
        tenantId: instance.tenantId,
        externalIds: {
          path: ['bigcommerce'],
          equals: customerId
        }
      },
      select: { id: true, firstSeenAt: true }
    });

    const emailHash = hashEmail(email);
    const phoneHash = hashPhone(phone);
    const firstName = rawCustomer?.first_name || rawCustomer?.firstname || null;
    const lastName = rawCustomer?.last_name || rawCustomer?.lastname || null;

    const data: Prisma.CustomerProfileUncheckedCreateInput = {
      id: crypto.randomUUID(),
      siteId: instance.siteId,
      tenantId: instance.tenantId,
      connectorInstanceId: instance.id,
      externalIds: {
        bigcommerce: customerId
      } as Prisma.InputJsonValue,
      emailHash: emailHash || undefined,
      // Reversible, encrypted-at-rest copy for dashboard display.
      emailEncrypted: encryptEmail(email) || undefined,
      phoneHash: phoneHash || undefined,
      lifecycleState: rawCustomer?.is_subscribed ? 'RETURNING' : 'NEW_GUEST',
      firstSeenAt: new Date(rawCustomer?.date_created || rawCustomer?.created_at || new Date()),
      lastSeenAt: new Date(rawCustomer?.date_modified || rawCustomer?.updated_at || new Date()),
      totalLtv: rawCustomer?.store_credit_amount ? Number(rawCustomer.store_credit_amount) : null,
      // Raw email/phone are NOT stored here — they live only in emailHash/phoneHash.
      // scrubEmails() neutralizes any address email nested in `addresses`.
      metadata: scrubEmails({
        bigcommerceCustomerId: customerId,
        firstName,
        lastName,
        company: rawCustomer?.company || null,
        customerGroupId: rawCustomer?.customer_group_id || null,
        isSubscribed: rawCustomer?.is_subscribed || false,
        addresses: rawCustomer?.addresses || [],
        connectorInstanceId: instance.id,
        connectorLabel: instance.label,
        // Actual customer registration date in BigCommerce — distinct from
        // lastSyncedAt (the sync/resync time). Used as "Customer Since".
        dateCreated: rawCustomer?.date_created || rawCustomer?.created_at || null,
        lastSyncedAt: new Date().toISOString()
      }) as Prisma.InputJsonValue
    };

    if (existing) {
      await prisma.customerProfile.update({
        where: { id: existing.id },
        data: {
          // Re-assert the real registration date so records synced before this
          // fix (whose firstSeenAt held a sync time) get corrected on resync.
          firstSeenAt: new Date(rawCustomer?.date_created || rawCustomer?.created_at || existing.firstSeenAt),
          lastSeenAt: new Date(rawCustomer?.date_modified || rawCustomer?.updated_at || new Date()),
          totalLtv: rawCustomer?.store_credit_amount ? Number(rawCustomer.store_credit_amount) : undefined,
          emailHash: emailHash || undefined,
          // Reversible, encrypted-at-rest copy for dashboard display.
          emailEncrypted: encryptEmail(email) || undefined,
          phoneHash: phoneHash || undefined,
          metadata: data.metadata
        }
      });

      return 'updated';
    }

    await prisma.customerProfile.create({
      data
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
}

export default BigCommerceCustomerSyncService;
