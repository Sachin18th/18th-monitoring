import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError, ZodTypeAny } from 'zod';
import { ResponseUtil } from '../utils/response';

/**
 * Higher-order function to create a validation middleware for request body, query, or params.
 */
export const validateRequest = (schemas: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }) => {
    return async (req: FastifyRequest, reply: FastifyReply) => {
        try {
            if (schemas.body) {
                req.body = await schemas.body.parseAsync(req.body);
            }
            if (schemas.query) {
                req.query = await schemas.query.parseAsync(req.query);
            }
            if (schemas.params) {
                req.params = await schemas.params.parseAsync(req.params);
            }
        } catch (error) {
            if (error instanceof ZodError) {
                return reply.status(400).send(ResponseUtil.error(error.issues, 'VALIDATION_ERROR', error, req.id as string));
            }
            return reply.status(400).send(ResponseUtil.error('Invalid request format', req.id as string, 'invalid_request'));
        }
    };
};