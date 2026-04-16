import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import crypto from 'crypto';

const getFilters = (req: any) => ({
    siteId: req.params.siteId || req.siteId || req.query.siteId,
});

export const ingestRunResults = async (req: any, res: any) => {
    try {
        const payload = req.body;
        const siteId = getFilters(req).siteId || 'store_001';
        
        const runId = `syn_${crypto.randomUUID().split('-')[0]}`;
        const record = {
            runId,
            siteId,
            timestamp: new Date().toISOString(),
            ...payload
        };

        GlobalMemoryStore.synthetics.push(record);
        
        // Trigger alert if success_status is false
        if (!payload.success_status) {
            const alert = {
                ruleId: 'rule_synthetic_fail',
                siteId,
                kpiName: 'syntheticFailure',
                severity: 'critical',
                message: `Synthetic journey "${payload.journey_name}" failed on ${payload.device_type} (${payload.browser})`,
                triggeredAt: new Date().toISOString()
            };
            
            const existing = GlobalMemoryStore.alerts.find(
                a => a.ruleId === alert.ruleId && a.status === 'active' && a.message === alert.message
            );
            
            if (!existing) {
                alert.status = 'active';
                alert.alertId = 'alt_' + Math.random().toString(36).slice(2, 7).toUpperCase();
                GlobalMemoryStore.alerts.push(alert);
            }
        }
        
        return res.code(201).send({ success: true, runId });
    } catch (err) {
        console.error('[SyntheticController] Ingest failure', err);
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getDashboardSummary = async (req: any, res: any) => {
    try {
        const { siteId } = getFilters(req);
        const records = GlobalMemoryStore.synthetics.filter((s: any) => s.siteId === siteId);
        
        if (records.length === 0) {
            // Return mock seed data if empty
            return res.code(200).send([
                { journey: 'Homepage Load', successRate: 99.8, avgTime: 1200 },
                { journey: 'Login Flow', successRate: 98.5, avgTime: 2400 },
                { journey: 'Signup Flow', successRate: 99.1, avgTime: 3100 },
                { journey: 'Protected Route Access', successRate: 100, avgTime: 850 }
            ]);
        }

        const journeys: Record<string, { total: number, success: number, time: number }> = {};
        records.forEach((r: any) => {
            const jName = r.journey_name;
            if (!journeys[jName]) journeys[jName] = { total: 0, success: 0, time: 0 };
            journeys[jName].total++;
            if (r.success_status) journeys[jName].success++;
            if (r.execution_time) journeys[jName].time += r.execution_time;
        });

        const summary = Object.entries(journeys).map(([journey, stats]) => ({
            journey,
            successRate: Math.round((stats.success / stats.total) * 1000) / 10,
            avgTime: Math.round(stats.time / stats.total)
        }));

        return res.code(200).send(summary);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getHistoryOptions = async (req: any, res: any) => {
    try {
        const { siteId } = getFilters(req);
        // Returns the last N runs
        const records = GlobalMemoryStore.synthetics
            .filter((s: any) => s.siteId === siteId)
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 50);

        if (records.length === 0) {
            return res.code(200).send([{
                timestamp: new Date().toISOString(),
                journey_name: 'Login Flow',
                device_type: 'desktop',
                browser: 'chromium',
                success_status: true,
                execution_time: 2100
            }]);
        }

        return res.code(200).send(records);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};

export const getFailures = async (req: any, res: any) => {
    try {
        const { siteId } = getFilters(req);
        const failures = GlobalMemoryStore.synthetics
            .filter((s: any) => s.siteId === siteId && !s.success_status)
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 20);

        // Mock failure if none
        if (failures.length === 0) {
            return res.code(200).send([{
                runId: 'syn_mock',
                timestamp: new Date(Date.now() - 3600000).toISOString(),
                journey_name: 'Signup Flow',
                step_name: 'Submit Form',
                device_type: 'mobile',
                browser: 'webkit',
                error_logs: 'Timeout waiting for selector "#success-message"',
                screenshot_url: '/screenshots/mock_failure.png',
                execution_time: 15000
            }]);
        }
        
        return res.code(200).send(failures);
    } catch (err) {
        return res.code(500).send({ error: 'Internal API Server Error' });
    }
};
