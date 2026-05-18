import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { GlobalMemoryStore } from '../../../../packages/db/src/adapters/in-memory.adapter';

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
        const instances = GlobalMemoryStore.projectIntegrations.get(siteId) || [];
        const filtered = instances.filter(i => i.id !== instanceId);
        GlobalMemoryStore.projectIntegrations.set(siteId, filtered);
        return { success: true };
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
