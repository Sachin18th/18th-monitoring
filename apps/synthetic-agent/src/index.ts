import cron from 'node-cron';
import { runHomepageJourney, runLoginJourney, runProtectedAccessJourney, JourneyResult } from './flows';
import { fetch } from 'undici';

const TARGET_URL  = process.env.TARGET_URL  || 'http://localhost:3000';
const API_BASE    = process.env.API_BASE     || 'http://localhost:4000';
const SITE_ID     = process.env.SITE_ID      || 'store_001';
const AGENT_EMAIL = process.env.AGENT_EMAIL  || 'superadmin@monitor.io';
const AGENT_PASS  = process.env.AGENT_PASS   || 'password123';

// ── Obtain a short-lived session token for API ingestion ────────────────────
async function fetchAgentToken(): Promise<string | null> {
    try {
        const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: AGENT_EMAIL, password: AGENT_PASS }),
        });
        if (!res.ok) throw new Error(`Login failed: ${res.status}`);
        const data = await res.json() as any;
        return data.token || null;
    } catch (err) {
        console.error('[SyntheticAgent] Auth failed:', err);
        return null;
    }
}

async function ingestResult(result: JourneyResult, token: string) {
    try {
        const response = await fetch(`${API_BASE}/api/v1/dashboard/synthetic/run-results`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ ...result, siteId: SITE_ID }),
        });

        if (!response.ok) {
            console.error(`[SyntheticAgent] Ingest failed: ${response.status} ${response.statusText}`);
        } else {
            console.log(`[SyntheticAgent] ✓ ${result.journey_name} (${result.device_type}) → success=${result.success_status}`);
        }
    } catch (error) {
        console.error('[SyntheticAgent] Network error during ingestion:', error);
    }
}

async function runAllJourneys() {
    console.log(`[${new Date().toISOString()}] Starting synthetic monitoring run...`);

    const token = await fetchAgentToken();
    if (!token) {
        console.error('[SyntheticAgent] Cannot obtain auth token — aborting run.');
        return;
    }

    const scenarios = [
        { name: 'Homepage', fn: runHomepageJourney },
        { name: 'Login',    fn: runLoginJourney },
        { name: 'Protected', fn: runProtectedAccessJourney },
    ];

    for (const scenario of scenarios) {
        // Desktop run
        const desktopResult = await scenario.fn(TARGET_URL, false);
        await ingestResult(desktopResult, token);

        // Mobile run
        const mobileResult = await scenario.fn(TARGET_URL, true);
        await ingestResult(mobileResult, token);
    }

    console.log(`[${new Date().toISOString()}] Synthetic monitoring run completed.`);
}

// Run every 4 hours: 0 */4 * * *
cron.schedule('0 */4 * * *', () => {
    runAllJourneys();
});

// Run immediately on start for the first time
console.log('Synthetic agent started. Running initial check...');
runAllJourneys();
