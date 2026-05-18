
import fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { errorResponse } from './utils/response';
import { IngestionService } from './services/ingestion.service';
import { DashboardService } from './services/dashboard.service';
import { ConfigResolver } from '../../../packages/config/src/resolver';
import { KafkaStreamConsumer } from '../../../services/processor/src/consumer/kafka-consumer';
import { TOPICS } from './config/topics';
import { dashboardRoutes } from './routes/dashboard';
import { login, getMe, getProjects } from './controllers/auth.controller';
import { createProject, updateProject, CreateProjectSchema } from './controllers/project.controller';
import { listPlatformUsers, createPlatformUser, updatePlatformUserStatus, purgeDemoData } from './controllers/admin.controller';
import { tenantAuthHandler } from './middlewares/auth.middleware';
import { viewOnlyGuard, roleGuard } from './middlewares/rbac.middleware';
import { validateRequest } from './middlewares/validator.middleware';
import { rateLimiter } from './middlewares/rate-limiter.middleware';
import { secureHeaders } from './middlewares/secure-headers.middleware';
import { tenantIsolationGuard } from './middlewares/tenant-isolation.middleware';
import { idempotencyGuard } from './middlewares/idempotency.middleware';
import { exposureV1Routes } from './exposure/routes/v1';
import { OutboundBridge } from './services/outbound-bridge';
import { initializeConnectors } from './initializers/connectors';
import { ScheduledMonitor } from './services/scheduled-monitor.service';
import { EventRegistry } from '../../../services/processor/src/registry/event-registry';
import { integrationRoutes } from './routes/integrations';
import { ingestionRoutes } from './routes/ingestion';
import { monitoringRoutes } from './routes/monitoring';
import { browserRoutes } from './routes/browser';
import { simulationRoutes } from './routes/simulation';

import { connectorRegistryService } from './services/connector-registry.service';
import { webhookRoutes } from './routes/webhooks';
import { SyntheticSchedulerService } from './services/synthetic-scheduler.service';
import { publicRoutes } from './routes/public';
import { configRoutes } from './routes/config';
import { syncRoutes } from './routes/sync';
import { resilienceRoutes } from './routes/resilience';
import { transformationRoutes } from './routes/transformation';
import { pipelineRoutes } from './routes/pipeline';
import { kpiRoutes } from './routes/kpi';
import { pagespeedRoutes } from './routes/pagespeed.route';
import { cache } from '../../../packages/cache/src';
import { BackendMonitor } from './utils/backend-monitor';


declare module 'fastify' {
  interface FastifyRequest {
    user: any;
  }
}

// ─── Boot the in-process stream consumer ──────────────────────────────────────
const consumer = new KafkaStreamConsumer();

// Subscribe to all streams and bridge them
consumer.onMessage = async (topic: string, message: any) => {
    if (topic === TOPICS.NOTIFICATIONS) {
        await OutboundBridge.handleInternalEvent(message);
    } else {
        // Default to processing via EventRegistry for ingestion streams
        await EventRegistry.route(message);
    }
};

consumer.connectAndSubscribe([
    TOPICS.BROWSER_EVENTS, 
    TOPICS.SERVER_EVENTS, 
    TOPICS.NOTIFICATIONS
]).then(() => console.log('[Platform] Event Engine & Outbound Bridge linked successfully'));

// ─── Build server ─────────────────────────────────────────────────────────────
export const bootstrapApi = async () => {
    console.log('[API] Initializing Fastify server…');
    initializeConnectors();
    ScheduledMonitor.start();

    const server = fastify({ logger: false });

    // ── Security Hardening ──────────────────────────────────────────────────
    
    // 1. Strict CORS Policy
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
    await server.register(cors, { 
        origin: true,  // Allow all origins in dev; update for production
        credentials: true
    });

    // ── Global Error Handler ───────────────────────────────────────────────
    server.setErrorHandler((error: any, request: any, reply: any) => {
        const correlationId = (request as any).correlationId;
        
        // Log error with context
        console.error(`[ERROR] ${correlationId} | ${error.name}: ${error.message}`, error.stack);

        if (error.validation) {
            return reply.status(400).send(errorResponse(error.message, 'VALIDATION_ERROR', error.validation, correlationId));
        }

        if (error.statusCode && error.statusCode < 500) {
            return reply.status(error.statusCode).send(errorResponse(error.message, (error as any).code || 'CLIENT_ERROR', null, correlationId));
        }

        const err = error as any;
        const message = env.NODE_ENV === 'production' ? 'An internal server error occurred' : error.message;
        reply.status(500).send(errorResponse(message, err.code || 'INTERNAL_SERVER_ERROR', null, correlationId));
    });
    
    // ── Global Observability & Security Middlewares ────────────────────────
    
    // Inject Correlation ID
    server.addHook('onRequest', async (req, reply) => {
        const headerId = req.headers['x-correlation-id'];
        const reqId = (Array.isArray(headerId) ? headerId[0] : headerId) || crypto.randomUUID();
        req.id = reqId; 
        (req as any).correlationId = reqId; // For unified service access
        reply.header('X-Correlation-ID', reqId);
    });

    // Request Logging
    server.addHook('onRequest', async (req) => {
        console.log(`[REQ] ${req.id} | ${req.method} ${req.url} | ip=${req.headers['x-forwarded-for'] || req.ip}`);
    });

    server.addHook('onResponse', async (req, reply) => {
        const time = Math.round((reply as any).getResponseTime?.() || 0);
        // Structured log for CloudWatch/Datadog metrics extraction
        console.log(`[METRIC] event=http_request siteId=${(req.params as any).siteId || 'global'} status=${reply.statusCode} latency_ms=${time} path=${req.url}`);
        
        // Phase 2: Record backend performance metrics for internal observability
        await BackendMonitor.recordResponse(req, reply, time);
    });

    server.addHook('onRequest', secureHeaders);
    // Rate limit: Max 100 requests per minute per IP
    server.addHook('onRequest', rateLimiter(100, 60_000));

    // Scoped Dashboard Routes
    await server.register(dashboardRoutes, { 
        prefix: '/api/v1/tenants/:tenantId/projects/:siteId',
        preHandler: [tenantAuthHandler, tenantIsolationGuard, viewOnlyGuard] 
    });

    // Compatibility Alias (to be deprecated)
    await server.register(dashboardRoutes, { 
        prefix: '/api/v1/dashboard',
        preHandler: [tenantAuthHandler, tenantIsolationGuard, viewOnlyGuard] 
    });

    // Scoped Integration Routes
    await server.register(integrationRoutes, { 
        prefix: '/api/v1/tenants/:tenantId/projects/:siteId/integrations' 
    });

    // Scoped Data Intake Routes
    await server.register(ingestionRoutes, { 
        prefix: '/api/v1' 
    });

    // Scoped Performance & Metric Routes
    await server.register(exposureV1Routes, { 
        prefix: '/api/v1' 
    });

    // Scoped Monitoring & Alerting Routes
    await server.register(monitoringRoutes, { 
       prefix: '/api/v1' 
    });

    await server.register(browserRoutes, { prefix: '/api/v1' });
    await server.register(simulationRoutes, { prefix: '/api/v1' });

    await server.register(webhookRoutes, {
        prefix: '/api/v1/ingest/webhooks'
    });

    await server.register(publicRoutes, {
        prefix: '/api/v1'
    });

    await server.register(configRoutes, { prefix: '/api/v1/config' });

    await server.register(syncRoutes, {
        prefix: '/api/v1/projects'
    });




    await server.register(resilienceRoutes, {
        prefix: '/api/v1/resilience'
    });


    await server.register(transformationRoutes, {
        prefix: '/api/v1'
    });

    await server.register(pipelineRoutes, {
        prefix: '/api/v1'
    });

    await server.register(kpiRoutes, {
        prefix: '/api/v1'
    });

    await server.register(pagespeedRoutes, {
        prefix: '/api/v1'
    });


    // ── Auth & RBAC ────────────────────────────────────────────────────────
    server.post('/api/v1/auth/login', {
        schema: {
            body: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 }
                }
            }
        }
    }, login);
    server.get('/api/v1/user/me',     { preHandler: [tenantAuthHandler] }, getMe);
    server.get('/api/v1/projects',    { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'SUPER_ADMIN', 'VIEWER'])] }, getProjects);
    server.post('/api/v1/projects',   { preHandler: [tenantAuthHandler, roleGuard(['SUPER_ADMIN']), validateRequest({ body: CreateProjectSchema })] }, createProject);
    server.patch('/api/v1/projects/:siteId', { preHandler: [tenantAuthHandler, tenantIsolationGuard, roleGuard(['TENANT_ADMIN', 'SUPER_ADMIN', 'PROJECT_ADMIN'])] }, updateProject);

    // System Access Management APIs
    server.get('/api/v1/admin/projects/:projectId/users',   { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'SUPER_ADMIN', 'PROJECT_ADMIN'])] }, listPlatformUsers);
    server.post('/api/v1/admin/projects/:projectId/users',  { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'SUPER_ADMIN', 'PROJECT_ADMIN'])] }, createPlatformUser);
    server.patch('/api/v1/admin/users/:userId/status',      { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'SUPER_ADMIN', 'PROJECT_ADMIN'])] }, updatePlatformUserStatus);

    // Legacy Aliases (Compatibility for customers -> users migration)
    server.get('/api/v1/admin/projects/:projectId/customers',   { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'SUPER_ADMIN', 'PROJECT_ADMIN'])] }, listPlatformUsers);
    server.post('/api/v1/admin/projects/:projectId/customers',  { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'SUPER_ADMIN', 'PROJECT_ADMIN'])] }, createPlatformUser);
    server.patch('/api/v1/admin/customers/:userId/status',      { preHandler: [tenantAuthHandler, roleGuard(['TENANT_ADMIN', 'SUPER_ADMIN', 'PROJECT_ADMIN'])] }, updatePlatformUserStatus);
    
    server.post('/api/v1/admin/demo/purge', { preHandler: [tenantAuthHandler, roleGuard(['SUPER_ADMIN'])] }, purgeDemoData);

    // ── Health & Readiness Probes (K8s / LB) ───────────────────────────────
    server.get('/health', async (_req, reply) => {
        // Liveness probe (is the process running?)
        const memoryUsage = process.memoryUsage();
        
        reply.send({ 
            status: 'UP', 
            environment: env.NODE_ENV,
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



    // Standardized via browserRoutes plugin (/api/v1/ingest/frontend)

    // ── Server Ingest (/i/server) ────────────────────────────────────────────
    server.post('/api/v1/i/server', async (request, reply) => {
        const body = request.body as any;
        if (!body?.siteId || !Array.isArray(body.events)) {
            return reply.status(400).send({ error: 'Invalid payload: siteId and events[] required' });
        }
        await IngestionService.processServerEvents(body.siteId, body.events);
        return reply.send({ success: true, count: body.events.length });
    });

    // ─── Listen ────────────────────────────────────────────────────────────
    if (process.env.NODE_ENV !== 'test') {
        const port = env.PORT;
        server.listen({ port, host: '0.0.0.0' }, (err, address) => {
            if (err) { 
                if ((err as any).code === 'EADDRINUSE') {
                    console.error(`[FATAL] Port ${port} is already in use. Please kill the zombie process or change PORT in .env.`);
                } else {
                    console.error(err); 
                }
                process.exit(1); 
            }
            console.log(`[API] Server listening on everything at ${address}`);
            console.log(`[API] Endpoints: GET /health, GET /api/v1/projects/:siteId/metrics/catalog`);

            // Start connector polling and synthetic monitors after the server is bound
            connectorRegistryService.startAllPollers('*');
            SyntheticSchedulerService.start();
        });
    }


    // ─── Graceful Shutdown ─────────────────────────────────────────────────
    const exitHandler = async (signal: string) => {
        console.log(`\n[Server] Received ${signal}, starting graceful shutdown...`);
        try {
            // Stop connector polling timers first to prevent new work being enqueued
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

    return server;
};

// ─── Entry Point ───────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
    bootstrapApi().catch(err => {
        console.error('[API] Critical startup failure', err);
        process.exit(1);
    });
}
