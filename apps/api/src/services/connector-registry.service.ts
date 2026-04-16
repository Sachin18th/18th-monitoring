import fs from 'fs';
import path from 'path';
import { externalSyncService } from './external-sync.service';

interface ConnectorSchedule {
    connectorId: string;
    label: string;
    type: string;
    schedule?: string; // cron expression (informational; we use setInterval for MVP)
    pollIntervalMs?: number;
}

export class ConnectorRegistryService {
    private connectors: ConnectorSchedule[] = [];
    private activeTimers: Map<string, NodeJS.Timeout> = new Map();

    constructor() {
        const configPath = path.join(__dirname, '../config/connectors/connector-registry.schema.json');
        try {
            const raw = fs.readFileSync(configPath, 'utf8');
            this.connectors = JSON.parse(raw).connectors;
        } catch {
            console.error('[ConnectorRegistry] Failed to load connector definitions.');
        }
    }

    /**
     * Starts polling timers for all api_poll connectors.
     * In production, this would be replaced by a proper cron scheduler (e.g., node-cron).
     */
    public startAllPollers(siteId: string) {
        const pollConnectors = this.connectors.filter(c => c.type === 'api_poll');
        for (const connector of pollConnectors) {
            const intervalMs = connector.pollIntervalMs ?? 15 * 60 * 1000; // default 15 min
            console.log(`[ConnectorRegistry] Scheduling poller for "${connector.label}" every ${intervalMs / 1000}s`);
            const timer = setInterval(async () => {
                try {
                    await externalSyncService.pollConnector(connector.connectorId);
                } catch (err) {
                    console.error(`[ConnectorRegistry] Poller error for ${connector.connectorId}:`, err);
                }
            }, intervalMs);
            this.activeTimers.set(connector.connectorId, timer);
        }
    }

    public stopAllPollers() {
        for (const [id, timer] of this.activeTimers.entries()) {
            clearInterval(timer);
            console.log(`[ConnectorRegistry] Stopped poller: ${id}`);
        }
        this.activeTimers.clear();
    }

    /** On-demand manual trigger for a specific connector (used by the sync API route) */
    public async pollExternalAPI(siteId: string, connectorId: string) {
        console.log(`[ConnectorRegistry] Manual poll triggered: ${connectorId} (site: ${siteId})`);
        return externalSyncService.pollConnector(connectorId);
    }

    /** Getters for observability */
    public listConnectors() {
        return this.connectors.map(c => ({
            connectorId: c.connectorId,
            label: c.label,
            type: c.type,
            isPolling: this.activeTimers.has(c.connectorId),
        }));
    }
}

export const connectorRegistryService = new ConnectorRegistryService();
