import { eventBuffer } from '../queue/buffer';
import { sessionManager } from '../core/session';
import { generateUUID } from '../core/utils';

export const userCollector = {
    init() {
        // Basic element hook identifying DOM clicks explicitly resolving links mapping down
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'BUTTON' || target.tagName === 'A')) {
                eventBuffer.addEvent({
                    eventId: generateUUID(),
                    eventType: 'user_click',
                    timestamp: new Date().toISOString(),
                    sessionId: sessionManager.sessionId,
                    metadata: { 
                        tag: target.tagName,
                        text: target.innerText?.substring(0, 50),
                        id: target.id 
                    }
                });
            }
        });

        // TODO: Isolate Session End limits binding strictly onto 'pagehide' constraints cleanly Native
        // TODO: Extend advanced UX tracking plotting native Rage Clicks limits
    }
};
