import { ConfigManagerService } from '../services/config.service';

// Abstraction
let configService: ConfigManagerService; 

export const resolveConfig = async (req: any, res: any) => {
    try {
        const { siteId, tenantId } = req.query; // Token verification handled natively upstream
        const resolved = await configService.getActiveResolvedConfig(siteId, tenantId);
        
        return res.status(200).json(resolved);
    } catch (err) {
        return res.status(500).json({ error: 'Failed config compilation.' });
    }
};

export const createDraft = async (req: any, res: any) => {
    try {
        const { targetLevel, targetId, payload } = req.body;
        // userId retrieved natively from Dashboard verification tokens
        const draft = await configService.stageConfigUpdate(targetLevel, targetId, payload, req.userId);
        
        return res.status(201).json(draft);
    } catch (err: any) {
        return res.status(400).json({ error: err.message }); // Yields explicit Validation bounds safely
    }
};

export const publishDraft = async (req: any, res: any) => {
    try {
        const { versionId } = req.params;
        await configService.activateConfig(versionId);
        
        return res.status(200).json({ message: 'Version deployed system-wide.' });
    } catch (err) {
        return res.status(500).json({ error: 'Config Deployment Failure.' });
    }
};
