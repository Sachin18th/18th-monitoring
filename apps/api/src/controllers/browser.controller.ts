import { BrowserIngestPayloadSchema } from '../../../../packages/events/src/schemas';
import { IngestionService } from '../services/ingestion.service';

export const handleBrowserIngest = async (req: any, res: any) => {
    try {
        const payload = req.body;
        
        // 1. Validate payload
        const parsed = BrowserIngestPayloadSchema.safeParse(payload);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Validation Failed',
                details: parsed.error.issues
            });
        }

        // 2. Pass to service
        const result = await IngestionService.processBrowserEvents(
            parsed.data.siteId, 
            parsed.data.events
        );

        // 3. Return success
        return res.status(202).json({
            message: 'Events accepted',
            ...result
        });
        
    } catch (err) {
        console.error('[BrowserController] Validation or internal error', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
