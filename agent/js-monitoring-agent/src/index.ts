import { configHandler } from './core/config';
import { sessionManager } from './core/session';
import { eventBuffer } from './queue/buffer';
import { performanceCollector } from './collectors/performance';
import { userCollector } from './collectors/user';
import { errorCollector } from './collectors/errors';
import { getDeviceMetadata, generateUUID } from './core/utils';

export const KpiAgent = {
    async init(options: { siteId: string, endpoint: string }) {
        if (!options.siteId || !options.endpoint) {
            console.error('[KPI Agent] Missing explicit URL binding arguments.');
            return;
        }

        const enabled = await configHandler.fetchConfig(options.siteId, options.endpoint);
        if (!enabled) return;

        sessionManager.init();

        // Dynamically instantiate bounds checking JSON config array logic precisely
        if (configHandler.state.tracking.performance) performanceCollector.init();
        if (configHandler.state.tracking.user) userCollector.init();
        if (configHandler.state.tracking.errors) errorCollector.init();

        // Push immediate start bounds securely 
        eventBuffer.addEvent({
            eventId: generateUUID(),
            eventType: 'session_start',
            timestamp: new Date().toISOString(),
            sessionId: sessionManager.sessionId,
            metadata: getDeviceMetadata() 
        });

        // TODO: Connect strict Privacy and GDPR blocks mapping opt-in controls
    }
};

(window as any).KpiAgent = KpiAgent;
