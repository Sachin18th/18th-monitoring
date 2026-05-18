// Endpoint: /ingest/frontend
import { FastifyInstance } from 'fastify';
import { handleBrowserIngest } from '../controllers/browser.controller';

export const browserRoutes = async (fastify: FastifyInstance) => {
    // Standardizing on the requested endpoint
    fastify.post('/ingest/frontend', handleBrowserIngest);
};
