import { FastifyRequest, FastifyReply } from 'fastify';
import { configManager } from '../../../../packages/config/src/manager/config.manager';
import { ConfigResolver } from '../../../../packages/config/src/resolver';
import { integrationConfigService } from '../services/integration-config.service';

export const getResolvedConfig = async (request: FastifyRequest<{ Params: { siteId: string } }>, reply: FastifyReply) => {
    try {
        const { siteId } = request.params;
        const resolver = new ConfigResolver();
        const config = resolver.resolve(siteId);
        return reply.send(config);
    } catch (err: any) {
        return reply.status(500).send({ error: 'Internal Error', message: err.message });
    }
};

export const publishConfig = async (request: FastifyRequest<{ Params: { siteId: string }, Body: any }>, reply: FastifyReply) => {
    try {
        const actorId = (request as any).user?.id || 'admin-fallback';
        const result = await configManager.publishDraft(request.params.siteId, actorId, request.body as any);
        
        // Emits 'CONFIG_PUBLISHED' to memory-bus to invalidate caches ideally.
        
        return reply.send(result);
    } catch (err: any) {
        return reply.status(500).send({ error: 'Internal Error', message: 'Failed to publish configuration.' });
    }
};

export const rollbackConfig = async (request: FastifyRequest<{ Params: { siteId: string }, Body: { versionId: string } }>, reply: FastifyReply) => {
    try {
        const actorId = (request as any).user?.id || 'admin-fallback';
        const result = await configManager.rollbackToVersion(request.params.siteId, actorId, request.body.versionId);
        return reply.send(result);
    } catch (err: any) {
        if (err.message.includes('not found')) return reply.status(404).send({ error: 'Not Found', message: err.message });
        return reply.status(500).send({ error: 'Internal Error', message: 'Failed to rollback mapping.' });
    }
};

// Add Connector Config (for integrations)
export const getIntegrationCatalog = async (request: FastifyRequest, reply: FastifyReply) => {
    const catalog = integrationConfigService.getCatalog();
    return reply.send(catalog);
};

export const getIntegrationCategories = async (request: FastifyRequest, reply: FastifyReply) => {
    const categories = integrationConfigService.getCategories();
    return reply.send(categories);
};

export const getProjectIntegrationInstances = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId } = request.params as any;
    const instances = integrationConfigService.getProjectIntegrations(siteId);
    return reply.send(instances);
};

export const createIntegrationInstance = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId } = request.params as any;
    const result = await integrationConfigService.createInstance(siteId, request.body as any);
    return reply.send(result);
};

export const updateIntegrationInstance = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId, instanceId } = request.params as any;
    const result = await integrationConfigService.updateInstance(siteId, instanceId, request.body as any);
    return reply.send(result);
};

export const deleteIntegrationInstance = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId, instanceId } = request.params as any;
    const result = await integrationConfigService.deleteInstance(siteId, instanceId);
    return reply.send(result);
};

export const testIntegrationConnection = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId, instanceId } = request.params as any;
    const { env } = request.body as any;
    const result = await integrationConfigService.testConnection(siteId, instanceId, env);
    return reply.send(result);
};
