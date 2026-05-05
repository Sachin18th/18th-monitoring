$basePath = "c:\kpi monitoring"
cd $basePath

function Write-File {
    param([string]$Path, [string]$Content)
    $dir = Split-Path $Path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Set-Content -Path $Path -Value  $Content.Trim() -Encoding UTF8
}

Write-File "packages/events/src/schemas.ts" @"
import { z } from 'zod';

export const BrowserEventTypes = z.enum([
    'page_view', 
    'session_start', 
    'session_end', 
    'js_error', 
    'api_failure'
]);

export const ServerEventTypes = z.enum([
    'order_placed', 
    'order_processed', 
    'csv_upload', 
    'oms_sync', 
    'oms_sync_failed'
]);

export const BaseEventSchema = z.object({
    eventId: z.string().uuid(),
    siteId: z.string(),
    eventType: z.union([BrowserEventTypes, ServerEventTypes, z.string()]),
    timestamp: z.string().datetime(), // ISO format
    sessionId: z.string().optional(),
    userId: z.string().optional(),
    metadata: z.record(z.any()).default({})
});

export const BrowserIngestPayloadSchema = z.object({
    siteId: z.string(),
    events: z.array(BaseEventSchema)
});

export const ServerIngestPayloadSchema = z.object({
    siteId: z.string(),
    events: z.array(BaseEventSchema)
});
"@

Write-File "packages/shared-types/src/index.ts" @"
import { z } from 'zod';
import { BaseEventSchema, BrowserIngestPayloadSchema, ServerIngestPayloadSchema } from '../../events/src/schemas';

export type BaseEvent = z.infer<typeof BaseEventSchema>;
export type BrowserIngestPayload = z.infer<typeof BrowserIngestPayloadSchema>;
export type ServerIngestPayload = z.infer<typeof ServerIngestPayloadSchema>;

export interface OrderEventMetadata {
    orderId: string;
    value?: number;
    source?: string;
    error?: string;
}

export interface PageViewMetadata {
    url: string;
    loadTime?: number;
}
"@

Write-File "apps/api/src/services/ingestion.service.ts" @"
import { BaseEvent } from '../../../../packages/shared-types/src';

export class IngestionService {
    
    /**
     * Handles validating and routing browser batch events.
     */
    static async processBrowserEvents(siteId: string, events: BaseEvent[]) {
        // TODO: Map events to internal formats if necessary
        // TODO: Publish batch to Kafka topic: 'browser-events'
        console.log(`[IngestionService] Processing \${events.length} browser events for site: \${siteId}`);
        return { success: true, processedCount: events.length };
    }

    /**
     * Handles validating and routing server integration events.
     */
    static async processServerEvents(siteId: string, events: BaseEvent[]) {
        // TODO: Implement server event specific enrichment
        // TODO: Publish events to Kafka topic: 'server-events'
        console.log(`[IngestionService] Processing \${events.length} server events for site: \${siteId}`);
        return { success: true, processedCount: events.length };
    }
}
"@

Write-File "apps/api/src/controllers/browser.controller.ts" @"
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
"@

Write-File "apps/api/src/controllers/server.controller.ts" @"
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
"@

Write-File "apps/api/src/routes/browser.ts" @"
// Endpoint: /i/browser
import { handleBrowserIngest } from '../controllers/browser.controller';

export const browserRoutes = (router: any) => {
    // Scaffold route binding
    router.post('/i/browser', handleBrowserIngest);
};
"@

Write-File "apps/api/src/routes/server.ts" @"
// Endpoint: /i/server
import { handleServerIngest } from '../controllers/server.controller';

export const serverRoutes = (router: any) => {
    // Scaffold route binding
    router.post('/i/server', handleServerIngest);
};
"@
