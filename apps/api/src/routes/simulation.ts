import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { IngestionService } from '../services/ingestion.service';

export const simulationRoutes = async (fastify: FastifyInstance) => {
  fastify.post('/simulate/full-observability', async (req, reply) => {
    const { siteId = 'proj-18th-digitech' } = req.body as any;

    // 1. RUM & Performance Scenarios
    await IngestionService.processBrowserEvents(siteId, [
        { eventId: crypto.randomUUID(), eventType: 'page_view', siteId, timestamp: new Date().toISOString(), metadata: { url: '/', title: 'Home' } },
        { eventId: crypto.randomUUID(), eventType: 'web_vital', siteId, timestamp: new Date().toISOString(), metadata: { metric: 'LCP', value: 2400, rating: 'good' } },
        { eventId: crypto.randomUUID(), eventType: 'web_vital', siteId, timestamp: new Date().toISOString(), metadata: { metric: 'CLS', value: 0.05, rating: 'good' } }
    ]);

    // 2. Backend API Performance Scenarios
    await IngestionService.processBackendMetrics(siteId, [
        { eventId: crypto.randomUUID(), eventType: 'backend_performance', siteId, timestamp: new Date().toISOString(), metadata: { route: '/api/v1/orders', method: 'POST', status: 201, duration: 850, journey: 'ORDER' } },
        { eventId: crypto.randomUUID(), eventType: 'backend_performance', siteId, timestamp: new Date().toISOString(), metadata: { route: '/api/v1/checkout', method: 'POST', status: 500, duration: 1200, journey: 'CHECKOUT' } }
    ]);

    // 3. Failure Intelligence Scenarios
    await IngestionService.processBrowserEvents(siteId, [
        { 
            eventId: crypto.randomUUID(), 
            eventType: 'js_error', 
            siteId, 
            timestamp: new Date().toISOString(), 
            metadata: { 
                message: 'Uncaught TypeError: Cannot read properties of undefined', 
                stack: 'TypeError: ... at Checkout.render (checkout.js:42:15)',
                source: 'runtime' 
            } 
        },
        { 
            eventId: crypto.randomUUID(), 
            eventType: 'business_failure', 
            siteId, 
            timestamp: new Date().toISOString(), 
            metadata: { category: 'PAYMENT', reason: 'Gateway Timeout', journey: 'CHECKOUT' } 
        }
    ]);

    // 4. Customer Journey Scenarios
    await IngestionService.processBrowserEvents(siteId, [
        { eventId: crypto.randomUUID(), eventType: 'funnel_step', siteId, sessionId: 'SESS-102', timestamp: new Date().toISOString(), metadata: { step: 'PDP' } },
        { eventId: crypto.randomUUID(), eventType: 'interaction_signal', siteId, sessionId: 'SESS-102', timestamp: new Date().toISOString(), metadata: { type: 'rage_click', target: 'BUTTON' } }
    ]);

    return reply.send({ 
        success: true, 
        message: 'Full Platform Observability simulation dispatched',
        phases: ['RUM', 'Backend', 'Failures', 'Journeys']
    });
  });

  fastify.post('/simulate/critical-failure', async (req, reply) => {
    const { siteId = 'proj-18th-digitech' } = req.body as any;

    console.log(`[Simulate] Triggering CRITICAL failure scenario for ${siteId}…`);

    // 1. Multiple Backend 500s (Triggers High API Error Rate Alert)
    await IngestionService.processBackendMetrics(siteId, [
        { eventId: crypto.randomUUID(), eventType: 'backend_performance', siteId, timestamp: new Date().toISOString(), metadata: { route: '/api/v1/payments', status: 500, duration: 2500 } },
        { eventId: crypto.randomUUID(), eventType: 'backend_performance', siteId, timestamp: new Date().toISOString(), metadata: { route: '/api/v1/payments', status: 500, duration: 2800 } }
    ]);

    // 2. Critical Business Failure (Triggers Payment Failure Alert)
    await IngestionService.processBrowserEvents(siteId, [
        { eventId: crypto.randomUUID(), eventType: 'business_failure', siteId, timestamp: new Date().toISOString(), metadata: { category: 'PAYMENT', reason: 'Stripe API Timeout', journey: 'CHECKOUT' } }
    ]);

    return reply.send({ 
        success: true, 
        message: 'Critical Failure simulated — check Alert & Incident Center',
        incident_triggered: true
    });
  });
};
