import { ServerIngestPayloadSchema } from '../../../../packages/events/src/schemas';
import { IngestionService } from '../services/ingestion.service';

export const handleServerIngest = async (req: any, res: any) => {
    try {
        const payload = req.body;

        // 1. Validate incoming server event payloads
        const parsed = ServerIngestPayloadSchema.safeParse(payload);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Validation Failed',
                details: parsed.error.issues
            });
        }

        // 2. Execute process flow
        const result = await IngestionService.processServerEvents(
            parsed.data.siteId,
            parsed.data.events
        );

        return res.status(202).json({
            message: 'Server events accepted',
            ...result
        });

    } catch (err) {
        console.error('[ServerController] Unexpected ingestion error', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
