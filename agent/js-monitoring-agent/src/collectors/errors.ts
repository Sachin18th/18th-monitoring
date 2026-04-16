import { eventBuffer } from '../queue/buffer';
import { sessionManager } from '../core/session';
import { generateUUID } from '../core/utils';

export const errorCollector = {
    init() {
        // Mapping uncaught evaluation structures out
        window.addEventListener('error', (e) => {
            eventBuffer.addEvent({
                eventId: generateUUID(),
                eventType: 'js_error',
                timestamp: new Date().toISOString(),
                sessionId: sessionManager.sessionId,
                metadata: { errorMsg: e.message, filename: e.filename, lineno: e.lineno }
            });
        });

        // Native async hooks constraints protecting promise mappings
        window.addEventListener('unhandledrejection', (e) => {
            eventBuffer.addEvent({
                eventId: generateUUID(),
                eventType: 'js_error',
                timestamp: new Date().toISOString(),
                sessionId: sessionManager.sessionId,
                metadata: { errorMsg: e.reason?.toString() || 'Unhandled Async Rejection' }
            });
        });

        // TODO: Patch Native XHR & Fetch bindings isolating mapping network latencies & api_failure tracking
    }
};
