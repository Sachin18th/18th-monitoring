<<<<<<< HEAD
﻿import { 
=======
import { 
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    ingestRunResults, 
    getDashboardSummary, 
    getHistoryOptions, 
    getFailures 
} from '../controllers/synthetic.controller';
import { tenantAuthHandler } from '../middlewares/auth.middleware';

export const syntheticRoutes = async (fastify: any) => {
    // We apply tenant protection
    fastify.addHook('preHandler', tenantAuthHandler);
    
    // Ingestion
    fastify.post('/run-results', ingestRunResults);
    
    // Dashboards and read paths
    fastify.get('/dashboard', getDashboardSummary);
    fastify.get('/history', getHistoryOptions);
    fastify.get('/failures', getFailures);
};
<<<<<<< HEAD

=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
