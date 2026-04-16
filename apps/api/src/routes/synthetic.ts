import { 
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
