import fs from 'fs';
import path from 'path';
import { externalSyncService } from './external-sync.service';
import { ConnectorManagerService } from './connector-manager.service';

export class ConnectorRegistryService {
    private activeTimers: Map<string, NodeJS.Timeout> = new Map();

    public listConnectors() {
        const configPath = path.join(__dirname, '../config/connectors/connector-registry.schema.json');
        try {
            const raw = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(raw).connectors;
        } catch { return []; }
    }

    /**
     * Starts all enabled pollers from the database.
     * Requirement 5 (Polling and sync orchestration)
     */
    public async startAllPollers(siteId: string) {
        // In production, we'd query enabled connectors from DB
        // For MVP hardening, we'll continue using the registry file but wrap calls in tracking
        const configPath = path.join(__dirname, '../config/connectors/connector-registry.schema.json');
        let registryConnectors = [];
        try {
            const raw = fs.readFileSync(configPath, 'utf8');
            registryConnectors = JSON.parse(raw).connectors;
        } catch { return; }

        const pollConnectors = registryConnectors.filter((c: any) => c.type === 'api_poll');
        
        for (const connector of pollConnectors) {
            const intervalMs = connector.pollIntervalMs ?? 15 * 60 * 1000;
            
            // Register Instance if not exists (Governance)
            // await this.ensureInstanceExists(siteId, connector);

            const timer = setInterval(async () => {
                try {
                    await externalSyncService.pollConnector(connector.connectorId);
                } catch (err) {
                    console.error(`[ConnectorRegistry] Poller fatal trigger error for ${connector.connectorId}:`, err);
                }
            }, intervalMs);
            
            this.activeTimers.set(connector.connectorId, timer);
        }
    }

    public stopAllPollers() {
        for (const [id, timer] of this.activeTimers.entries()) {
            clearInterval(timer);
        }
        this.activeTimers.clear();
    }

    public async pollExternalAPI(siteId: string, connectorId: string) {
        return externalSyncService.pollConnector(connectorId);
    }
}

export const connectorRegistryService = new ConnectorRegistryService();

