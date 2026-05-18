import { FastifyRequest, FastifyReply } from 'fastify';
import { GovernanceService } from '../services/governance.service';

export const listAccessKeys = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId } = request.params as any;
    const keys = GlobalMemoryStore.projectAccessKeys.get(siteId) || [];
    // Only return metadata, no secrets
    return reply.send(keys.map(({ secretHash, ...rest }: any) => rest));
};

export const createAccessKey = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId } = request.params as any;
    const userId = (request.user as any)?.id || 'unknown';
    const result = await GovernanceService.createKey(siteId, userId, request.body);
    return reply.send(result);
};

export const rotateAccessKey = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId, keyId } = request.params as any;
    const userId = (request.user as any)?.id || 'unknown';
    const result = await GovernanceService.rotateKey(siteId, keyId, userId);
    return reply.send(result);
};

export const revokeAccessKey = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId, keyId } = request.params as any;
    const userId = (request.user as any)?.id || 'unknown';
    const result = await GovernanceService.revokeKey(siteId, keyId, userId);
    return reply.send(result);
};

export const getAuditLogs = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId } = request.params as any;
    const logs = GovernanceService.getAuditLogs(siteId);
    return reply.send(logs);
};

// Internal Import for store access
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
