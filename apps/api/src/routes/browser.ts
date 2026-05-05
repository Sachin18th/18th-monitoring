<<<<<<< HEAD
// Endpoint: /ingest/frontend
import { FastifyInstance } from 'fastify';
import { handleBrowserIngest } from '../controllers/browser.controller';

export const browserRoutes = async (fastify: FastifyInstance) => {
    // Standardizing on the requested endpoint
    fastify.post('/ingest/frontend', handleBrowserIngest);
=======
﻿// Endpoint: /i/browser
import { handleBrowserIngest } from '../controllers/browser.controller';

export const browserRoutes = (router: any) => {
    // Scaffold route binding
    router.post('/i/browser', handleBrowserIngest);
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
};
