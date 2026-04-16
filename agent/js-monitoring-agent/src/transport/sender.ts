import { configHandler } from '../core/config';

export const transportLayer = {
    async sendBatch(payload: any, retries = 2): Promise<boolean> {
        try {
            // Extends 'keepalive' protecting background deliveries mapped out during page destruction inherently
            const res = await fetch(configHandler.state.ingestUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            });
            return res.ok;
        } catch (err) {
            if (retries > 0) {
                // TODO: Exponential backoff integrating buffer tracking explicitly
                console.warn('[KPI Agent] Payload execution halted. Retrying bound...', err);
                return await this.sendBatch(payload, retries - 1); // Native recursion
            }
            // TODO: Offline buffering logic utilizing localForage or IndexedDB wrapping dropped arrays securely
            console.error('[KPI Agent] Dropping metric array. Network failure terminal.');
            return false;
        }
    }
};
