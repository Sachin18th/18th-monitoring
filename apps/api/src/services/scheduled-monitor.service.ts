import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { HealthEngine } from './health-engine.service';
import { AlertEngine } from './alert-engine.service';

/**
 * Scheduled monitor that periodically evaluates health and alerts for ALL active projects.
 * This implements the "scheduled monitoring" path from Phase 8, complementing event-driven evaluation.
 */
export class ScheduledMonitor {
    private static intervalHandle: ReturnType<typeof setInterval> | null = null;

    public static start(intervalMs = 5 * 60 * 1000) { // Default: every 5 minutes
        if (this.intervalHandle) return; // Prevent double-starts

        console.log(`[ScheduledMonitor] 🕐 Starting periodic health checks every ${intervalMs / 1000}s`);

        this.intervalHandle = setInterval(async () => {
            await this.runCycle();
        }, intervalMs);

        // Run once immediately on startup
        setImmediate(() => this.runCycle());
    }

    public static stop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
            console.log('[ScheduledMonitor] Stopped.');
        }
    }

    private static async runCycle() {
        console.log('[ScheduledMonitor] ▶ Running periodic health & alert cycle...');
        
        // Iterate over all known projects across all tenants
        for (const [siteId, project] of GlobalMemoryStore.projects.entries()) {
            try {
                const { tenantId } = project;
                
                // 1. Compute health snapshot
                HealthEngine.evaluate(siteId, tenantId);
                
                // 2. Evaluate alert rules (freshness, connector degradation, DLQ state)
                await AlertEngine.evaluateProject(siteId, tenantId);

            } catch (err: any) {
                console.error(`[ScheduledMonitor] Failed health cycle for ${siteId}:`, err.message);
            }
        }

        console.log('[ScheduledMonitor] ✓ Periodic health cycle complete.');
    }
}
