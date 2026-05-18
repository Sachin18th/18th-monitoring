export interface KpiPlatformOptions {
    siteId: string;
    token: string;
    host?: string;
}

export class KpiPlatform {
    private siteId: string;
    private token: string;
    private host: string;

    constructor(options: KpiPlatformOptions) {
        if (!options.siteId || !options.token) {
            throw new Error('KpiPlatform requires siteId and token');
        }
        this.siteId = options.siteId;
        this.token = options.token;
        this.host = options.host || 'https://api.yourdomain.com';
    }

    private async fetchApi(path: string, options: RequestInit = {}) {
        const url = `${this.host}/api/v1/projects/${this.siteId}${path}`;
        const headers = {
            'Content-Type': 'application/json',
            'x-api-key': this.token,
            ...options.headers,
        };

        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            throw new Error(`KpiPlatform API error: ${response.statusText}`);
        }
        return response.json();
    }

    public async getMetricsCatalog() {
        return this.fetchApi('/kpis');
    }

    public async getMetric(metricKey: string) {
        return this.fetchApi(`/kpis/${metricKey}`);
    }

    public async getWidget(widgetId: string) {
        // Fetches widget spec from resolved config, and its populated metrics
        return this.fetchApi(`/widgets/${widgetId}`);
    }

    public async getOrderSummary() {
        return this.fetchApi('/orders/source-breakdown');
    }

    public async getIntegrationStatus() {
        return this.fetchApi('/integrations/status');
    }
}
