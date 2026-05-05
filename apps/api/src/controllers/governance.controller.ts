import { FastifyRequest, FastifyReply } from 'fastify';
<<<<<<< HEAD
import { GovernanceService } from '../services/governance.service';
=======
import { governanceService } from '../services/governance.service';
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb

export const listAccessKeys = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId } = request.params as any;
    const keys = GlobalMemoryStore.projectAccessKeys.get(siteId) || [];
    // Only return metadata, no secrets
    return reply.send(keys.map(({ secretHash, ...rest }: any) => rest));
};

export const createAccessKey = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId } = request.params as any;
    const userId = (request.user as any)?.id || 'unknown';
<<<<<<< HEAD
    const result = await GovernanceService.createKey(siteId, userId, request.body);
=======
    const result = await governanceService.createKey(siteId, userId, request.body);
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    return reply.send(result);
};

export const rotateAccessKey = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId, keyId } = request.params as any;
    const userId = (request.user as any)?.id || 'unknown';
<<<<<<< HEAD
    const result = await GovernanceService.rotateKey(siteId, keyId, userId);
=======
    const result = await governanceService.rotateKey(siteId, keyId, userId);
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    return reply.send(result);
};

export const revokeAccessKey = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId, keyId } = request.params as any;
    const userId = (request.user as any)?.id || 'unknown';
<<<<<<< HEAD
    const result = await GovernanceService.revokeKey(siteId, keyId, userId);
=======
    const result = await governanceService.revokeKey(siteId, keyId, userId);
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    return reply.send(result);
};

export const getAuditLogs = async (request: FastifyRequest, reply: FastifyReply) => {
    const { siteId } = request.params as any;
<<<<<<< HEAD
    const logs = GovernanceService.getAuditLogs(siteId);
=======
    const logs = governanceService.getAuditLogs(siteId);
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    return reply.send(logs);
};

// Internal Import for store access
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
