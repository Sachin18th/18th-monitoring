import { eventBuffer } from '../queue/buffer';
import { sessionManager } from '../core/session';
import { generateUUID } from '../core/utils';

export const performanceCollector = {
    init() {
        // Collect mapping metrics bounding TTFB bounds
        window.addEventListener('load', () => {
            const perfEntries = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
            if (perfEntries) {
                const loadTime = perfEntries.loadEventEnd - perfEntries.startTime;
                
                eventBuffer.addEvent({
                    eventId: generateUUID(),
                    eventType: 'page_view',
                    timestamp: new Date().toISOString(),
                    sessionId: sessionManager.sessionId,
                    metadata: { url: window.location.href, loadTime }
                });
            }
        });

        // TODO: Expand robust PerformanceObserver structures natively tracing Core Web Vitals (FCP, LCP)
    }
};
