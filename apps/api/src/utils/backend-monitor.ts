import { FastifyRequest, FastifyReply } from 'fastify';
import { IngestionService } from '../services/ingestion.service';
import crypto from 'crypto';

export enum JourneyType {
  SEARCH = 'SEARCH',
  PDP = 'PDP',
  PLP = 'PLP',
  CART = 'CART',
  CHECKOUT = 'CHECKOUT',
  AUTH = 'AUTH',
  ORDER = 'ORDER',
  SYSTEM = 'SYSTEM',
  OTHER = 'OTHER'
}

export enum Criticality {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  NORMAL = 'NORMAL'
}

interface EndpointConfig {
  journey: JourneyType;
  criticality: Criticality;
  label: string;
}

const ENDPOINT_MAPPING: Record<string, EndpointConfig> = {
  '/api/v1/projects': { journey: JourneyType.SYSTEM, criticality: Criticality.HIGH, label: 'List Projects' },
  '/api/v1/auth/login': { journey: JourneyType.AUTH, criticality: Criticality.CRITICAL, label: 'Login' },
  '/api/v1/ingest/frontend': { journey: JourneyType.SYSTEM, criticality: Criticality.HIGH, label: 'Frontend Ingest' },
  '/api/v1/tenants/:tenantId/projects/:siteId/dashboard': { journey: JourneyType.SYSTEM, criticality: Criticality.NORMAL, label: 'Dashboard Data' },
  // Commerce Journey Mappings (Simulated patterns)
  '/api/v1/products': { journey: JourneyType.PLP, criticality: Criticality.HIGH, label: 'Product List' },
  '/api/v1/products/:id': { journey: JourneyType.PDP, criticality: Criticality.HIGH, label: 'Product Detail' },
  '/api/v1/cart': { journey: JourneyType.CART, criticality: Criticality.CRITICAL, label: 'Cart Operations' },
  '/api/v1/checkout': { journey: JourneyType.CHECKOUT, criticality: Criticality.CRITICAL, label: 'Checkout' },
  '/api/v1/orders': { journey: JourneyType.ORDER, criticality: Criticality.CRITICAL, label: 'Order Placement' },
};

export class BackendMonitor {
  static async recordResponse(req: FastifyRequest, reply: FastifyReply, durationMs: number) {
    try {
      const routePattern = (req as any).routeOptions?.url || req.url;
      const config = this.resolveConfig(routePattern);
      
      const event = {
        eventId: crypto.randomUUID(),
        eventType: 'backend_performance',
        siteId: (req.params as any).siteId || 'global',
        timestamp: new Date().toISOString(),
        sessionId: req.headers['x-session-id'] as string || undefined,
        userId: (req as any).user?.id,
        metadata: {
          path: req.url,
          route: routePattern,
          method: req.method,
          status: reply.statusCode,
          duration: durationMs,
          journey: config.journey,
          criticality: config.criticality,
          label: config.label,
          correlationId: (req as any).correlationId,
          userAgent: req.headers['user-agent'],
          ip: req.ip
        }
      };

      // Async dispatch - do not await to keep request cycle fast
      IngestionService.processBackendMetrics(event.siteId, [event as any]).catch(err => {
        console.error('[BackendMonitor] Failed to dispatch metric', err);
      });

    } catch (err) {
      // Fail silently to protect request lifecycle
      console.error('[BackendMonitor] Instrumentation error', err);
    }
  }

  private static resolveConfig(pattern: string): EndpointConfig {
    // Exact match
    if (ENDPOINT_MAPPING[pattern]) return ENDPOINT_MAPPING[pattern];

    // Simple pattern matching for dynamic routes
    for (const [key, config] of Object.entries(ENDPOINT_MAPPING)) {
      if (key.includes(':') && pattern.startsWith(key.split(':')[0])) {
        return config;
      }
    }

    return { journey: JourneyType.OTHER, criticality: Criticality.NORMAL, label: pattern };
  }
}
