import { prisma } from '@kpi-platform/db';
import { HealthEngine } from './health-engine.service';
import { AlertEngine } from './alert-engine.service';
import { NotificationService } from './notification.service';

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

        // Source of truth is the database. The old in-memory GlobalMemoryStore
        // only ever held demo/seeded projects, so real projects were never
        // evaluated on the schedule — and their summary emails never sent.
        // Iterate the persisted projects so every real project is covered.
        let projects: Array<{ id: string; tenantId: string }> = [];
        try {
            projects = await prisma.project.findMany({
                where: { status: 'ACTIVE' },
                select: { id: true, tenantId: true },
            });
        } catch (err: any) {
            console.error('[ScheduledMonitor] Failed to load projects:', err?.message);
            return;
        }

        for (const { id: siteId, tenantId } of projects) {
            // Health snapshot is best-effort (legacy in-memory path) — never let
            // it block the alert evaluation + summary flush for the project.
            try {
                HealthEngine.evaluate(siteId, tenantId);
            } catch {
                /* best-effort */
            }

            try {
                // 1. Evaluate alert rules → raise/resolve alerts.
                await AlertEngine.evaluateProject(siteId, tenantId);

                // 2. Send the project-level summary email. Only done on the
                //    scheduled cycle (never on read): one consolidated email of
                //    all open alerts to the shared recipients, on the project's
                //    chosen cadence (decoupled from each rule's check window).
                await NotificationService.sendProjectSummary(siteId);
            } catch (err: any) {
                console.error(`[ScheduledMonitor] Failed alert cycle for ${siteId}:`, err?.message);
            }
        }

        console.log(`[ScheduledMonitor] ✓ Periodic cycle complete (${projects.length} project${projects.length === 1 ? '' : 's'}).`);
    }
}
