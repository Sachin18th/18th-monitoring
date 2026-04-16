import fastify from 'fastify';
import cors from '@fastify/cors';
import { IngestionService } from './services/ingestion.service';
import { DashboardService } from './services/dashboard.service';
import { ConfigResolver } from '../../../packages/config/src/resolver';
import { KafkaStreamConsumer } from '../../../services/processor/src/consumer/kafka-consumer';
import { TOPICS } from './config/topics';
import { dashboardRoutes } from './routes/dashboard';
import { login, getMe, getProjects } from './controllers/auth.controller';
import { listProjectCustomers, createCustomer, updateCustomerStatus } from './controllers/admin.controller';
import { tenantAuthHandler } from './middlewares/auth.middleware';
import { viewOnlyGuard, roleGuard } from './middlewares/rbac.middleware';
import { rateLimiter } from './middlewares/rate-limiter.middleware';
import { secureHeaders } from './middlewares/secure-headers.middleware';
import { tenantIsolationGuard } from './middlewares/tenant-isolation.middleware';
import { idempotencyGuard } from './middlewares/idempotency.middleware';

// ─── Boot the in-process stream consumer ──────────────────────────────────────

// This subscribes to the MemoryBus so events published via IngestionService
// are immediately routed through the KPI engine and alert evaluator.
const consumer = new KafkaStreamConsumer();
consumer.connectAndSubscribe([TOPICS.BROWSER_EVENTS, TOPICS.SERVER_EVENTS])
  .then(() => console.log('[Processor] Stream consumer subscribed to MemoryBus topics'));

// ─── Build server ─────────────────────────────────────────────────────────────
export const bootstrapApi = async () => {
    console.log('[API] Initializing Fastify server…');
    const server = fastify({ logger: false });

    // ── Security Hardening ──────────────────────────────────────────────────
    
    // 1. Strict CORS Policy
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    await server.register(cors, { 
        origin: allowedOrigins.length > 0 ? allowedOrigins : [/localhost:\d+$/], // Default to localhost but forbid '*' in prod
        credentials: true
    });

    // 2. JWT Secret Strength Validation
    const jwtSecret = process.env.JWT_SECRET || '';
    if (process.env.NODE_ENV === 'production') {
        if (jwtSecret.length < 64 || jwtSecret === 'replace_with_at_least_64_char_random_string') {
            console.error('[FATAL] Production JWT_SECRET is missing or insecure (min 64 chars required).');
            process.exit(1);
        }
    }
    
    // ── Global Observability & Security Middlewares ────────────────────────
    
    // Inject Correlation ID
    server.addHook('onRequest', async (req, reply) => {
        const reqId = req.headers['x-correlation-id'] || crypto.randomUUID();
        req.id = reqId; // Fastify attaches this gracefully
        reply.header('X-Correlation-ID', reqId);
    });

    // Request Logging
    server.addHook('onRequest', async (req) => {
        console.log(`[REQ] ${req.id} | ${req.method} ${req.url} | ip=${req.headers['x-forwarded-for'] || req.ip}`);
    });

    server.addHook('onResponse', async (req, reply) => {
        const time = Math.round(reply.getResponseTime());
        // Structured log for CloudWatch/Datadog metrics extraction
        console.log(`[METRIC] event=http_request siteId=${(req.params as any).siteId || 'global'} status=${reply.statusCode} latency_ms=${time} path=${req.url}`);
    });

    server.addHook('onRequest', secureHeaders);
    // Rate limit: Max 100 requests per minute per IP
    server.addHook('onRequest', rateLimiter(100, 60_000));

    await server.register(dashboardRoutes, { 
        prefix: '/api/v1/dashboard',
        preHandler: [tenantAuthHandler, viewOnlyGuard] 
    });

    await server.register(require('./routes/public').publicRoutes, {
        prefix: '/api/v1'
    });

    const configRoutes = require('./routes/config').configRoutes;
    await server.register(configRoutes, { prefix: '/api/v1/config' });

    await server.register(require('./routes/sync').syncRoutes, {
        prefix: '/api/v1/projects'
    });


    await server.register(require('./routes/webhooks').webhookRoutes, {
        prefix: '/api/v1/webhooks'
    });

    // ── Auth & RBAC ────────────────────────────────────────────────────────
    server.post('/api/v1/auth/login', login);
    server.get('/api/v1/user/me',     { preHandler: [tenantAuthHandler] }, getMe);
    server.get('/api/v1/projects',    { preHandler: [tenantAuthHandler, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, getProjects);

    // Placeholder for management APIs
    server.get('/api/v1/admin/projects/:projectId/customers', { preHandler: [tenantAuthHandler, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, listProjectCustomers);
    server.post('/api/v1/admin/projects/:projectId/customers', { preHandler: [tenantAuthHandler, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, createCustomer);
    server.patch('/api/v1/admin/customers/:userId/status', { preHandler: [tenantAuthHandler, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, updateCustomerStatus);

    // ── Health & Readiness Probes (K8s / LB) ───────────────────────────────
    server.get('/health', async (_req, reply) => {
        // Liveness probe (is the process running?)
        const memoryUsage = process.memoryUsage();
        const { cache } = require('../../../packages/cache/src');
        
        reply.send({ 
            status: 'UP', 
            environment: process.env.NODE_ENV || 'development',
            uptime_seconds: process.uptime(),
            memory: {
                rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
            },
            cache: cache.getTelemetry(),
            ts: new Date().toISOString() 
        });
    });

    server.get('/ready', async (_req, reply) => {
        // Readiness probe (can it accept traffic?)
        // TODO (PROD): Await kafka check `await publisher.isConnected()`
        // TODO (PROD): Await db check `await db.ping()`
        reply.send({ 
            status: 'READY', 
            dependencies: {
                kafka: 'Connected (MemoryBus MVP)',
                db: 'Connected (MemoryStore MVP)'
            },
            consumer: 'subscribed' 
        });
    });



    // ── Browser Ingest (/i/browser) ─────────────────────────────────────────
    server.post('/api/v1/i/browser', async (request, reply) => {
        const body = request.body as any;
        if (!body?.siteId || !Array.isArray(body.events)) {
            return reply.status(400).send({ error: 'Invalid payload: siteId and events[] required' });
        }
        await IngestionService.processBrowserEvents(body.siteId, body.events);
        return reply.send({ success: true, count: body.events.length });
    });

    // ── Server Ingest (/i/server) ────────────────────────────────────────────
    server.post('/api/v1/i/server', async (request, reply) => {
        const body = request.body as any;
        if (!body?.siteId || !Array.isArray(body.events)) {
            return reply.status(400).send({ error: 'Invalid payload: siteId and events[] required' });
        }
        await IngestionService.processServerEvents(body.siteId, body.events);
        return reply.send({ success: true, count: body.events.length });
    });

    // ── Simulate endpoint (dev/demo shortcut) ───────────────────────────────
    server.post('/api/v1/simulate', { preHandler: [tenantAuthHandler, roleGuard(['ADMIN', 'SUPER_ADMIN'])] }, async (request, reply) => {
        const { siteId: bodySiteId } = request.body as any || {};
        const { siteId: querySiteId } = request.query as any || {};
        let siteId = bodySiteId || querySiteId;

        // If not provided, use the first assigned project or store_001
        if (!siteId) {
            siteId = request.user.assignedProjects?.length > 0 ? request.user.assignedProjects[0] : 'store_001';
        }

        // Project membership check for ADMIN
        if (request.user.role === 'ADMIN' && !request.user.assignedProjects.includes(siteId)) {
            return reply.status(403).send({ error: 'Forbidden', message: 'You cannot simulate events for a project you do not manage.' });
        }

        console.log(`\n[Simulate] ▶ Running Comprehensive E2E Simulation for: ${siteId}…`);

        // 1. Performance Scenarios
        await IngestionService.processBrowserEvents(siteId, [
            // Fast loads
            { eventId: crypto.randomUUID(), eventType: 'page_view', siteId, timestamp: new Date().toISOString(), sessionId: 's_perf_1', userId: 'u1', metadata: { loadTime: 1200, url: '/', ttfb: 200, fcp: 800, lcp: 1100 } },
            // Slow load (SLA breach > 3000ms)
            { eventId: crypto.randomUUID(), eventType: 'page_view', siteId, timestamp: new Date().toISOString(), sessionId: 's_perf_2', userId: 'u2', metadata: { loadTime: 4200, url: '/checkout', ttfb: 800, fcp: 2500, lcp: 4000 } },
            // Web Vitals metrics
            { eventId: crypto.randomUUID(), eventType: 'browser_metric', siteId, timestamp: new Date().toISOString(), sessionId: 's_perf_1', userId: 'u1', metadata: { metric: 'CLS', value: 0.15 } },
            { eventId: crypto.randomUUID(), eventType: 'browser_metric', siteId, timestamp: new Date().toISOString(), sessionId: 's_perf_1', userId: 'u1', metadata: { metric: 'FID', value: 120 } },
            // JS Errors
            { eventId: crypto.randomUUID(), eventType: 'js_error', siteId, timestamp: new Date().toISOString(), sessionId: 's_err_1', userId: 'u3', metadata: { errorMsg: 'Uncaught TypeError: window.oms is not a function' } }
        ]);

        // 2. User Activity Scenarios
        const userSessions = ['us_1', 'us_2', 'us_3'];
        for (const sid of userSessions) {
            await IngestionService.processBrowserEvents(siteId, [
                { eventId: crypto.randomUUID(), eventType: 'session_start', siteId, timestamp: new Date().toISOString(), sessionId: sid, userId: sid, metadata: {} },
                { eventId: crypto.randomUUID(), eventType: 'page_view', siteId, timestamp: new Date(Date.now() + 1000).toISOString(), sessionId: sid, userId: sid, metadata: { url: '/products' } },
                { eventId: crypto.randomUUID(), eventType: 'click', siteId, timestamp: new Date(Date.now() + 5000).toISOString(), sessionId: sid, userId: sid, metadata: { elementId: 'add-to-cart-btn' } },
                { eventId: crypto.randomUUID(), eventType: 'user_activity', siteId, timestamp: new Date(Date.now() + 10000).toISOString(), sessionId: sid, userId: sid, metadata: { action: 'active' } }
            ]);
        }

        // 3. Order Lifecycle Scenarios
        await IngestionService.processServerEvents(siteId, [
            // Successful flow
            { eventId: crypto.randomUUID(), eventType: 'order_placed', siteId, timestamp: new Date().toISOString(), sessionId: 'o_1', userId: 'ou_1', metadata: { orderId: 'ORD-SUCCESS-101', value: 150.0, channel: 'web' } },
            { eventId: crypto.randomUUID(), eventType: 'order_processed', siteId, timestamp: new Date(Date.now() + 2000).toISOString(), metadata: { orderId: 'ORD-SUCCESS-101' } },
            // Delayed flow (Triggered because missing processed event)
            { eventId: crypto.randomUUID(), eventType: 'order_placed', siteId, timestamp: new Date(Date.now() - 10000).toISOString(), sessionId: 'o_2', userId: 'ou_2', metadata: { orderId: 'ORD-DELAY-202', value: 259.99, channel: 'mobile' } },
            // POS order
            { eventId: crypto.randomUUID(), eventType: 'order_placed', siteId, timestamp: new Date().toISOString(), metadata: { orderId: 'ORD-POS-303', value: 45.0, channel: 'pos' } }
        ]);

        // 4. Integration Health Scenarios
        await IngestionService.processServerEvents(siteId, [
            { eventId: crypto.randomUUID(), eventType: 'oms_sync', siteId, timestamp: new Date().toISOString(), metadata: { system: 'OMS-1' } },
            { eventId: crypto.randomUUID(), eventType: 'oms_sync', siteId, timestamp: new Date().toISOString(), metadata: { system: 'OMS-1' } },
            { eventId: crypto.randomUUID(), eventType: 'oms_sync_failed', siteId, timestamp: new Date().toISOString(), metadata: { error: 'Connection Timeout', system: 'OMS-1' } },
            { eventId: crypto.randomUUID(), eventType: 'csv_upload', siteId, timestamp: new Date().toISOString(), metadata: { filename: 'inventory.csv', success: false } }
        ]);

        console.log('[Simulate] ✓ Full monitoring spectrum scenarios dispatched');
        return reply.send({ message: 'Simulation complete — dashboards updated across 4 domains', eventCount: 20 });
    });

    // ─── Listen ────────────────────────────────────────────────────────────
    const port = process.env.PORT ? parseInt(process.env.PORT) : 4000;
    server.listen({ port, host: '0.0.0.0' }, (err, address) => {
        if (err) { console.error(err); process.exit(1); }
        console.log(`[API] Server listening on everything at ${address}`);
        console.log(`[API] Endpoints: GET /health, GET /api/v1/projects/:siteId/metrics/catalog`);

        // Start connector polling timers after the server is bound
        const { connectorRegistryService } = require('./services/connector-registry.service');
        connectorRegistryService.startAllPollers('*');
    });

    // ─── Graceful Shutdown ─────────────────────────────────────────────────
    const exitHandler = async (signal: string) => {
        console.log(`\n[Server] Received ${signal}, starting graceful shutdown...`);
        try {
            // Stop connector polling timers first to prevent new work being enqueued
            const { connectorRegistryService } = require('./services/connector-registry.service');
            connectorRegistryService.stopAllPollers();
            // TODO (PROD): Add publisher.disconnect(), db.close() when adapters have real connections
            await server.close();
            console.log('[Server] Fastify server closed. All pollers drained successfully.');
            process.exit(0);
        } catch (err) {
            console.error('[Server] Error during graceful shutdown:', err);
            process.exit(1);
        }
    };

    process.on('SIGINT', () => exitHandler('SIGINT'));
    process.on('SIGTERM', () => exitHandler('SIGTERM'));
};

bootstrapApi();
