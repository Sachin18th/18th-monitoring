import { FastifyRequest, FastifyReply } from 'fastify';
import { GovernanceService } from '../services/governance.service';
import { AuditService } from '../services/audit.service';

/**
 * Captures request/response telemetry for auditing and usage tracking.
 */
export const apiAuditHandler = async (req: any, reply: FastifyReply) => {
    // Only track Exposure Layer traffic
    if (!req.url.startsWith('/api/v1')) return;

    const startTime = Date.now();

    // Hook into response completion
    reply.raw.on('finish', async () => {
        const duration = Date.now() - startTime;
        const statusCode = reply.statusCode;
        const isError = statusCode >= 400;
        
        // Track Usage if API Key was used
        if (req.authMode === 'API_KEY' && req.user?.id) {
            const bytes = parseInt(reply.getHeader('content-length') as string) || 0;
            GovernanceService.trackUsage(req.user.id, bytes, isError);
            
            // Detailed Audit Log for non-2xx or sensitive paths
            if (isError || req.method !== 'GET') {
                await AuditService.log({
                    action: `API_${req.method}_${req.url.split('/')[3]?.toUpperCase() || 'GENERAL'}`,
                    actorId: req.user.id,
                    targetId: req.siteId || 'global',
                    status: isError ? 'FAILURE' : 'SUCCESS',
                    metadata: {
                        method: req.method,
                        path: req.url,
                        statusCode,
                        durationMs: duration,
                        traceId: req.id,
                        ip: req.ip
                    }
                });
            }
        }
    });
};
