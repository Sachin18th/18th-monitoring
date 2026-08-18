import { describe, it, expect, vi, afterEach } from 'vitest';
import { StoreDatabaseNotActive } from '../lib/tenant-prisma';
import { getOrders, getCustomerList } from './dashboard.controller';
import { DashboardService } from '../services/dashboard.service';

/**
 * Guards the status mapping in respondWithError.
 *
 * Connecting a store provisions its physical database in the background, so
 * every store-data read in that window throws StoreDatabaseNotActive. These
 * used to be answered 500, which counted against the platform's own error-rate
 * KPI and tripped the CRITICAL "High API Error Rate" rule — the product paging
 * itself over a store being set up correctly.
 */

/** Minimal Fastify reply/request doubles capturing the status + payload. */
const makeRes = () => {
    const res: any = {
        statusCode: null,
        payload: null,
        request: { id: 'rid-1' },
        code(c: number) { res.statusCode = c; return res; },
        send(p: any) { res.payload = p; return res; },
    };
    return res;
};

const makeReq = () => ({
    tenantId: 't1',
    params: { siteId: 'proj_1' },
    query: { connector_instance_id: 'conn_1' },
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('respondWithError status mapping', () => {
    it('answers 409, not 500, while the store database is still provisioning', async () => {
        vi.spyOn(DashboardService, 'getOrders').mockRejectedValue(new StoreDatabaseNotActive('conn_1', 'provisioning'));

        const res = makeRes();
        await getOrders(makeReq(), res);

        expect(res.statusCode).toBe(409);
        expect(res.payload.error.code).toBe('STORE_DATABASE_NOT_READY');
    });

    it('answers 409 when the tenant_databases row does not exist yet', async () => {
        // The window between createInstance responding and provisionStoreDatabase
        // inserting the row — the exact race the connect flow hits.
        vi.spyOn(DashboardService, 'getCustomers').mockRejectedValue(new StoreDatabaseNotActive('conn_1', null));

        const res = makeRes();
        await getCustomerList(makeReq(), res);

        expect(res.statusCode).toBe(409);
        expect(res.payload.error.code).toBe('STORE_DATABASE_NOT_READY');
    });

    it('keeps a failed provision in the 5xx range so it still alerts', async () => {
        vi.spyOn(DashboardService, 'getOrders').mockRejectedValue(new StoreDatabaseNotActive('conn_1', 'failed'));

        const res = makeRes();
        await getOrders(makeReq(), res);

        expect(res.statusCode).toBe(503);
        expect(res.payload.error.code).toBe('STORE_DATABASE_PROVISION_FAILED');
    });

    it('still answers 500 for a genuine unexpected error', async () => {
        vi.spyOn(DashboardService, 'getOrders').mockRejectedValue(new Error('boom'));

        const res = makeRes();
        await getOrders(makeReq(), res);

        expect(res.statusCode).toBe(500);
        expect(res.payload.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
});
