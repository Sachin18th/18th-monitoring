import { prisma, decryptSecret } from '@kpi-platform/db';
import { HealthEngine } from './health-engine.service';
import { AlertEngine } from './alert-engine.service';
import { NotificationService } from './notification.service';
import { StoreHealthService } from './store-health.service';
import { PaymentGatewayService } from './payment-gateway.service';
import { registerShopifyPixel, verifyShopifyPixelExists } from '../../../../packages/connectors/src/commerce/shopify-pixel.service';

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

            // Refresh the signals the newer alert families read so they
            // evaluate against current state, not stale snapshots:
            //   · store-API health  → integration:unhealthy_connectors
            //   · payment gateways   → payment_gateway:degraded_gateways
            // Both are best-effort; a probe failure must not block the cycle.
            // (SMS gateway status is probed live inside the alert engine.)
            await StoreHealthService.checkProject(siteId).catch((err: any) =>
                console.error(`[ScheduledMonitor] store-health probe failed for ${siteId}:`, err?.message),
            );
            await PaymentGatewayService.syncConfiguredGateways(siteId, tenantId).catch((err: any) =>
                console.error(`[ScheduledMonitor] gateway refresh failed for ${siteId}:`, err?.message),
            );

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

        // ─── Shopify Web Pixel health checks (per connector) ──────────────────
        // Verify each active Shopify connector's registered pixel still exists on
        // the store; auto-recover (re-register) if it has gone missing. Best-effort.
        try {
            const shopifyConnectors = await prisma.connectorInstance.findMany({
                where: { providerId: 'shopify', disconnectedAt: null },
                select: { id: true },
            });
            for (const { id } of shopifyConnectors) {
                await this.checkShopifyPixelHealth(id);
            }
        } catch (err: any) {
            console.error('[ScheduledMonitor] Shopify pixel health sweep failed:', err?.message);
        }

        console.log(`[ScheduledMonitor] ✓ Periodic cycle complete (${projects.length} project${projects.length === 1 ? '' : 's'}).`);
    }

    /**
     * Verify (and auto-recover) the Shopify Web Pixel for a single connector.
     * Reads the connector, probes Shopify for the registered pixel, and
     * re-registers it if missing. Never throws.
     */
    private static async checkShopifyPixelHealth(connectorInstanceId: string): Promise<void> {
        try {
            const instance = await prisma.connectorInstance.findUnique({
                where: { id: connectorInstanceId },
                select: {
                    id: true,
                    siteId: true,
                    providerId: true,
                    syncConfig: true,
                    pixelConfig: true,
                    credentials: {
                        orderBy: { lastRotatedAt: 'desc' },
                        take: 1,
                        select: { encryptedSecret: true },
                    },
                },
            });

            if (!instance || instance.providerId !== 'shopify') return;

            const pixelConfig = (instance.pixelConfig || {}) as Record<string, any>;
            const isRegistered = pixelConfig.status === 'active' && !!pixelConfig.pixel_id;

            const config = (instance.syncConfig || {}) as Record<string, any>;
            const shopDomain = String(config.shopDomain || '')
                .trim()
                .replace(/^https?:\/\//i, '')
                .split('/')[0]
                .replace(/\/+$/, '')
                .trim();
            const accessToken = this.resolveShopifyToken(instance.credentials?.[0]?.encryptedSecret);

            if (!shopDomain || !accessToken) return;

            // If a pixel is already registered, verify it still exists on the
            // store; healthy ones need no action. Connectors with an empty/
            // unregistered pixel_config fall through and get registered for the
            // first time (bootstrap), so instances created before pixel support
            // — or whose registration was skipped at activation — self-heal.
            if (isRegistered) {
                const verification = await verifyShopifyPixelExists(shopDomain, accessToken, String(pixelConfig.pixel_id));
                if (verification.exists) return; // Healthy — nothing to do.
            }

            // Pixel missing or never registered — attempt to (re-)register.
            const base = process.env.PUBLIC_BASE_URL || process.env.TRACKER_PUBLIC_BASE_URL;
            if (!base) {
                console.warn('[ShopifyPixel] PUBLIC_BASE_URL/TRACKER_PUBLIC_BASE_URL not set — cannot auto-recover pixel.');
                return;
            }
            const ingestUrl = `${base.replace(/\/+$/, '')}/api/track`;
            const result = await registerShopifyPixel(shopDomain, accessToken, instance.siteId, instance.id, ingestUrl);

            if (result.success) {
                await prisma.connectorInstance.update({
                    where: { id: instance.id },
                    data: {
                        pixelConfig: {
                            ...pixelConfig,
                            pixel_id: result.pixelId,
                            status: 'active',
                            flow: 'programmatic',
                            ...(isRegistered
                                ? { auto_recovered: true, recovered_at: new Date().toISOString() }
                                : { registered_at: new Date().toISOString() }),
                            error: null,
                        },
                    },
                });
                console.log(
                    `[ShopifyPixel] ${isRegistered ? 'Auto-recovered missing' : 'Bootstrapped'} pixel for connector ${instance.id}.`
                );
            } else {
                await prisma.connectorInstance.update({
                    where: { id: instance.id },
                    data: {
                        pixelConfig: {
                            ...pixelConfig,
                            status: 'failed',
                            error: result.error,
                        },
                    },
                });
            }
        } catch (err: any) {
            console.error(`[ShopifyPixel] checkShopifyPixelHealth failed for ${connectorInstanceId}:`, err?.message || err);
        }
    }

    /** Decrypt a credential envelope and normalize the Shopify admin token. */
    private static resolveShopifyToken(serialized: string | null | undefined): string {
        if (!serialized) return '';
        try {
            const parsed = decryptSecret(serialized);
            if (!parsed || typeof parsed !== 'object') return '';
            const token =
                parsed.adminApiAccessToken ||
                parsed.accessToken ||
                parsed.access_token ||
                parsed.token ||
                parsed.apiKey ||
                parsed.password;
            return token ? String(token).trim() : '';
        } catch {
            return '';
        }
    }
}