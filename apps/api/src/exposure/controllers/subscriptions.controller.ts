import { FastifyRequest, FastifyReply } from 'fastify';
import { GlobalMemoryStore } from '../../../../../packages/db/src/adapters/in-memory.adapter';
import { ResponseUtil } from '../../utils/response';
import crypto from 'crypto';

export const listSubscriptions = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;
    
    const subs = GlobalMemoryStore.projectWebhookSubscriptions.get(siteId) || [];
    return reply.send(ResponseUtil.success(subs, undefined, { traceId, siteId }));
};

export const createSubscription = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;
    const body = req.body as any;

    const newSub = {
        id: `sub_${crypto.randomUUID().slice(0, 8)}`,
        siteId,
        label: body.label || 'New Webhook',
        callbackUrl: body.callbackUrl,
        secret: body.secret || `sh_${crypto.randomBytes(12).toString('hex')}`,
        status: 'active',
        eventTypes: body.eventTypes || ['*'],
        retryPolicy: body.retryPolicy || { maxRetries: 3, backoff: 'exponential' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: (req as any).user?.id || 'anonymous'
    };

    const subs = GlobalMemoryStore.projectWebhookSubscriptions.get(siteId) || [];
    subs.push(newSub);
    GlobalMemoryStore.projectWebhookSubscriptions.set(siteId, subs);

    return reply.status(201).send(ResponseUtil.success(newSub, undefined, { traceId, siteId }));
};

export const deleteSubscription = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;
    const { subId } = req.params as any;

    const subs = GlobalMemoryStore.projectWebhookSubscriptions.get(siteId) || [];
    const filtered = subs.filter(s => s.id !== subId);
    
    if (subs.length === filtered.length) {
        return reply.status(404).send(ResponseUtil.error('Subscription not found', traceId));
    }

    GlobalMemoryStore.projectWebhookSubscriptions.set(siteId, filtered);
    return reply.send(ResponseUtil.success({ deleted: true }, undefined, { traceId, siteId }));
};

export const getDeliveryLogs = async (req: FastifyRequest, reply: FastifyReply) => {
    const siteId = (req as any).siteId;
    const traceId = req.id as string;
    
    const { OutboundDispatcherService } = require('../../services/outbound-dispatcher.service');
    const logs = await OutboundDispatcherService.getRecentLogs(siteId);

    return reply.send(ResponseUtil.success(logs, undefined, { traceId, siteId }));
};
