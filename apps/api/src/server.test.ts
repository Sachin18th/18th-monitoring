import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { bootstrapApi } from './server';
import { GlobalMemoryStore } from '../../../packages/db/src/adapters/in-memory.adapter';

describe('API Functional Tests', () => {
    let app: any;

    beforeAll(async () => {
        // Setup initial store state if needed
        GlobalMemoryStore.seed();
        const testUser = { id: 'u1', email: 'admin@tushar.com', status: 'active', role: 'SUPER_ADMIN', tenantId: 'tenant_001', assignedProjects: ['store_001'] };
        GlobalMemoryStore.users.set('u1', testUser);
        GlobalMemoryStore.sessions.set('dev-token', {
            token: 'dev-token',
            user: testUser,
            expiresAt: new Date(Date.now() + 86400 * 1000).toISOString()
        });
        
        // Start server in test mode
        app = await bootstrapApi();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it('GET /health returns 200 OK', async () => {
        const response = await request(app.server).get('/health');
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('UP');
    });

    it('GET /api/v1/tenants/tenant_001/projects/store_001/summaries returns metrics', async () => {
        const response = await request(app.server)
            .get('/api/v1/tenants/tenant_001/projects/store_001/summaries')
            .set('Authorization', 'Bearer dev-token'); 

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('POST /api/v1/ingest/webhooks/int_sap_erp accepts events', async () => {
        const payload = { event: 'order_sync', data: { id: 123, total: 100 } };
        const response = await request(app.server)
            .post('/api/v1/ingest/webhooks/int_sap_erp')
            .send(payload)
            .set('x-event-id', 'eve_123');

        expect(response.status).toBe(202);
        expect(response.body.status).toBe('ACCEPTED');
    });
});
