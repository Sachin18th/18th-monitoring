(async function() {
    console.log('[Agent] KPI Monitoring Agent initializing…');
    const SITE_ID = 'store_001'; // Usually injected via template tag or data-attribute
    const BASE_URL = window.KPI_API_URL || 'http://localhost:4000';
    const CONFIG_API = `${BASE_URL}/api/v1/config/${SITE_ID}`;
    const INGEST_API = `${BASE_URL}/api/v1/i/browser`;
    
    let config = {
        tracking: { performance: true, errors: true, user: true },
        sampling: { sessionRate: 1.0 }
    };

    // ── Load Config ──────────────────────────────────────────────────────────
    try {
        const resp = await fetch(CONFIG_API);
        if (resp.ok) {
            config = await resp.json();
            console.log('[Agent] Remote config loaded:', config);
        }
    } catch (e) {
        console.warn('[Agent] Using default config due to fetch error');
    }

    // ── Sampling Logic ───────────────────────────────────────────────────────
    const isSampled = Math.random() <= config.sampling.sessionRate;
    if (!isSampled) {
        console.log('[Agent] Session not sampled. Tracking disabled.');
        return;
    }

    let eventBuffer = [];

    function sendBuffer() {
        if (eventBuffer.length === 0) return;
        const payload = {
            siteId: SITE_ID,
            events: eventBuffer
        };
        fetch(INGEST_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(err => console.error('[Agent] Push failed', err));
        
        eventBuffer = [];
    }

    // Periodically flush buffer safely
    setInterval(sendBuffer, 3000);
    window.addEventListener('beforeunload', sendBuffer);

    // ── Collectors ───────────────────────────────────────────────────────────
    
    // 1. Performance
    if (config.tracking.performance) {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const perf = window.performance.timing;
                const loadTime = perf.loadEventEnd - perf.navigationStart;
                if (loadTime > 0) {
                    eventBuffer.push({
                        eventId: crypto.randomUUID(),
                        eventType: 'page_view',
                        siteId: SITE_ID,
                        timestamp: new Date().toISOString(),
                        metadata: { url: window.location.href, loadTime }
                    });
                    console.log('[Agent] Recorded page_view:', loadTime, 'ms');
                }
            }, 0);
        });
    }

    // 2. Errors
    if (config.tracking.errors) {
        window.addEventListener('error', (event) => {
            eventBuffer.push({
                eventId: crypto.randomUUID(),
                eventType: 'js_error',
                siteId: SITE_ID,
                timestamp: new Date().toISOString(),
                metadata: { errorMsg: event.message, filename: event.filename, lineno: event.lineno }
            });
            console.log('[Agent] Recorded js_error:', event.message);
        });
    }

    console.log('[Agent] Monitoring active.');
})();
