import { FastifyRequest, FastifyReply } from 'fastify';
import { IngestionPipeline } from '../services/ingestion-pipeline.service';
import { ResponseUtil } from '../utils/response';
import crypto from 'crypto';

export class ImportController {

    /**
     * Handles manual file uploads for batch ingestion.
     * Path: /api/v1/tenants/:tenantId/projects/:siteId/imports
     */
    public static async uploadFile(req: FastifyRequest, reply: FastifyReply) {
        const { tenantId, siteId } = req.params as any;
        const correlationId = req.id as string;

        // In a real scenario, we'd use @fastify/multipart
        const { filename, contentType, payload, entityType } = req.body as any;

        if (!payload) {
            return reply.code(400).send(ResponseUtil.error([{ code: 'MISSING_PAYLOAD', message: 'No file data received' }], correlationId));
        }

        // 1. Wrap into Ingestion Envelope
        const envelope: any = {
            id: correlationId,
            mode: 'FILE_IMPORT' as const,
            tenantId,
            projectId: siteId,
            entityType: entityType || 'BATCH_UPLOAD',
            receivedAt: new Date().toISOString(),
            payload,
            metadata: {
                filename,
                contentType,
                size: JSON.stringify(payload).length
            }
        };

        // 2. Process via Pipeline
        try {
            const result = await IngestionPipeline.intake(envelope);
            
            if (result.status === 'REJECTED') {
                return reply.code(400).send(ResponseUtil.error([{ 
                    code: result.error?.code || 'VALIDATION_FAILED', 
                    message: result.error?.message || 'File validation failed' 
                }], correlationId));
            }

            return reply.code(202).send(ResponseUtil.success({
                id: result.id,
                status: result.status,
                artifactId: result.artifactId
            }, { correlationId }, correlationId));

        } catch (err: any) {
            return reply.code(500).send(ResponseUtil.error([{ code: 'IMPORT_ERROR', message: err.message }], correlationId));
        }
    }
}
