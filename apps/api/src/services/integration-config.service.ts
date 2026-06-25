import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';
import { prisma, decryptSecret } from '@kpi-platform/db';
import { deregisterShopifyPixel } from '../../../../packages/connectors/src/commerce/shopify-pixel.service';

export interface IntegrationInstance {
    id: string;
    connectorId: string;
    label: string;
    category: string;
    status: 'Active' | 'Degraded' | 'Offline' | 'Configuring';
    health: number;
    enabled: boolean;
    config: {
        prod: Record<string, string>;
        staging: Record<string, string>;
    };
    syncSettings: {
        frequency: string;
        retryPolicy: string;
        timeout: number;
    };
    lastSyncAt?: string;
    lastSyncStatus?: string;
    errorCount?: number;
}

export class IntegrationConfigService {
    private registryPath = path.join(__dirname, '../config/connectors/connector-registry.schema.json');

    public getCatalog() {
        try {
            const raw = fs.readFileSync(this.registryPath, 'utf8');
            const data = JSON.parse(raw);
            return data.connectors.map((c: any) => ({
                id: c.connectorId,
                label: c.label,
                category: c.category || 'other'
            }));
        } catch (err) {
            return [];
        }
    }

    public getCategories() {
        try {
            const raw = fs.readFileSync(this.registryPath, 'utf8');
            const data = JSON.parse(raw);
            return data.categories || [];
        } catch (err) {
            return [];
        }
    }

    public getProjectIntegrations(siteId: string) {
        const instances = GlobalMemoryStore.projectIntegrations.get(siteId) || [];
        return instances.map(inst => ({
            ...inst,
            config: {
                prod: this.maskObject(inst.config.prod),
                staging: this.maskObject(inst.config.staging)
            }
        }));
    }

    public async createInstance(siteId: string, params: Partial<IntegrationInstance>) {
        const instances = GlobalMemoryStore.projectIntegrations.get(siteId) || [];
        
        const newInstance: IntegrationInstance = {
            id: `int_${crypto.randomBytes(4).toString('hex')}`,
            connectorId: params.connectorId || 'custom_api',
            label: params.label || 'New Connection',
            category: params.category || 'Custom',
            status: 'Configuring',
            health: 100,
            enabled: false,
            config: { prod: {}, staging: {} },
            syncSettings: { frequency: '15m', retryPolicy: 'constant', timeout: 30 }
        };

        instances.push(newInstance);
        GlobalMemoryStore.projectIntegrations.set(siteId, instances);
        return newInstance;
    }

    public async updateInstance(siteId: string, instanceId: string, updates: any) {
        const instances = GlobalMemoryStore.projectIntegrations.get(siteId) || [];
        const index = instances.findIndex(i => i.id === instanceId);
        if (index === -1) throw new Error('Instance not found');

        const inst = instances[index];

        if (updates.config?.prod) {
            inst.config.prod = this.mergeSecure(inst.config.prod, updates.config.prod);
        }
        if (updates.config?.staging) {
            inst.config.staging = this.mergeSecure(inst.config.staging, updates.config.staging);
        }
        if (updates.enabled !== undefined) inst.enabled = updates.enabled;
        if (updates.label) inst.label = updates.label;
        if (updates.syncSettings) inst.syncSettings = { ...inst.syncSettings, ...updates.syncSettings };

        instances[index] = inst;
        GlobalMemoryStore.projectIntegrations.set(siteId, instances);
        return inst;
    }

    public async deleteInstance(siteId: string, instanceId: string) {
        // ─── Shopify Web Pixel cleanup + DB soft delete (best-effort) ─────────
        // Runs BEFORE the in-memory deletion below. Must never block disconnect:
        // any failure is recorded on pixel_config and swallowed.
        try {
            const dbInstance = await prisma.connectorInstance.findUnique({
                where: { id: instanceId },
                select: {
                    id: true,
                    providerId: true,
                    syncConfig: true,
                    pixelConfig: true,
                    credentials: {
                        orderBy: { lastRotatedAt: 'desc' },
                        take: 1,
                        select: { encryptedSecret: true }
                    }
                }
            });

            if (dbInstance) {
                const pixelConfig = (dbInstance.pixelConfig || {}) as Record<string, any>;

                if (pixelConfig.status === 'active' && pixelConfig.pixel_id) {
                    const config = (dbInstance.syncConfig || {}) as Record<string, any>;
                    const shopDomain = String(config.shopDomain || '')
                        .trim()
                        .replace(/^https?:\/\//i, '')
                        .split('/')[0]
                        .replace(/\/+$/, '')
                        .trim();
                    const creds = this.resolveCredentials(dbInstance.credentials?.[0]?.encryptedSecret);
                    const accessToken = String(creds.adminApiAccessToken || '').trim();

                    const result = await deregisterShopifyPixel(shopDomain, accessToken, String(pixelConfig.pixel_id));

                    if (result.success) {
                        await prisma.connectorInstance.update({
                            where: { id: instanceId },
                            data: {
                                pixelConfig: {
                                    ...pixelConfig,
                                    status: 'removed',
                                    removed_at: new Date().toISOString(),
                                    error: null
                                }
                            }
                        });
                    } else {
                        await prisma.connectorInstance.update({
                            where: { id: instanceId },
                            data: {
                                pixelConfig: {
                                    ...pixelConfig,
                                    status: 'removal_failed',
                                    error: result.error
                                }
                            }
                        });
                    }
                }
                // If pixel_config is empty or status is not "active", skip cleanup silently.

                // DB soft delete (schema supports disconnected_at).
                await prisma.connectorInstance.update({
                    where: { id: instanceId },
                    data: { disconnectedAt: new Date() }
                });
            }
        } catch (err: any) {
            console.error('[ShopifyPixel] deleteInstance pixel cleanup errored (non-fatal):', err?.message || err);
        }

        const instances = GlobalMemoryStore.projectIntegrations.get(siteId) || [];
        const filtered = instances.filter(i => i.id !== instanceId);
        GlobalMemoryStore.projectIntegrations.set(siteId, filtered);
        return { success: true };
    }

    /**
     * Decrypt a connector credential envelope and normalize the Shopify admin
     * token field. Mirrors the sync services' credential resolution.
     */
    private resolveCredentials(serialized: string | null | undefined): Record<string, any> {
        if (!serialized) return {};
        try {
            const parsed = decryptSecret(serialized);
            if (!parsed || typeof parsed !== 'object') return {};
            if (parsed.adminApiAccessToken) return parsed;
            const altToken = parsed.accessToken || parsed.access_token || parsed.token || parsed.apiKey || parsed.password;
            if (altToken) return { ...parsed, adminApiAccessToken: String(altToken) };
            return parsed;
        } catch {
            return {};
        }
    }

    public async testConnection(siteId: string, instanceId: string, env: 'prod' | 'staging') {
        const instances = GlobalMemoryStore.projectIntegrations.get(siteId) || [];
        const inst = instances.find(i => i.id === instanceId);
        
        await new Promise(r => setTimeout(r, 1000));

        if (!inst || !inst.config[env] || Object.keys(inst.config[env]).length === 0) {
            return { success: false, message: 'Incomplete configuration for environment.' };
        }

        const success = Math.random() > 0.15;
        return {
            success,
            latency: Math.floor(Math.random() * 150) + 40,
            message: success ? 'Handshake successful.' : 'Connection timed out (Timeout: 30s)'
        };
    }

    private maskObject(obj: any) {
        if (!obj) return {};
        const masked: any = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string' && value.length > 4) {
                masked[key] = `••••••••${value.slice(-4)}`;
            } else {
                masked[key] = value;
            }
        }
        return masked;
    }

    private mergeSecure(current: any, updates: any) {
        const merged = { ...current };
        for (const [key, value] of Object.entries(updates)) {
            if (typeof value === 'string' && value.includes('••••••••')) continue; 
            merged[key] = value;
        }
        return merged;
    }
}

export const integrationConfigService = new IntegrationConfigService();