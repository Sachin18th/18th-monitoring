import { resolveConfig, createDraft, publishDraft } from '../controllers/config.controller';

export const configRoutes = (router: any) => {
    
    // External consumption mappings: Loaded natively by website embeds identifying properties rapidly
    router.get('/api/v1/config/resolve', resolveConfig);

    // Advanced mutation mappings: Enforce explicit RBAC administration mappings internally
    router.post('/api/v1/config/draft', createDraft);
    router.post('/api/v1/config/version/:versionId/publish', publishDraft);
};
