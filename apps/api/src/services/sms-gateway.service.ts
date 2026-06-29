// SMS gateway live status probe.
//
// Unlike the payment gateway service this is a PURE live probe — no DB writes,
// no Prisma, no caching. Each call hits the gateway's public status page right
// now and returns the normalized health. Twilio, ClickSend and Infobip expose
// the standard Statuspage.io schema; GupShup has a proprietary status API that
// we parse defensively.

const PROBE_TIMEOUT_MS = 5_000;

export type SmsGatewaySlug = 'twilio' | 'gupshup' | 'clicksend' | 'infobip';

export interface SmsGatewayStatus {
    gateway: SmsGatewaySlug;
    displayName: string;
    indicator: 'none' | 'minor' | 'major' | 'critical' | 'unknown';
    description: string;
    statusPageUrl: string;
    checkedAt: string;
    httpStatus: number | null;
    activeDowntimes: number;
}

type GatewayDefinition = {
    slug: SmsGatewaySlug;
    displayName: string;
    statusPageUrl: string;
    statusEndpoint: string;
    incidentsEndpoint: string | null; // null = no standard incidents feed (GupShup)
    schema: 'statuspage' | 'gupshup';
};

const GATEWAYS: Record<SmsGatewaySlug, GatewayDefinition> = {
    twilio: {
        slug: 'twilio',
        displayName: 'Twilio',
        statusPageUrl: 'https://status.twilio.com',
        statusEndpoint: 'https://status.twilio.com/api/v2/status.json',
        incidentsEndpoint: 'https://status.twilio.com/api/v2/incidents/unresolved.json',
        schema: 'statuspage'
    },
    clicksend: {
        slug: 'clicksend',
        displayName: 'ClickSend',
        statusPageUrl: 'https://status.clicksend.com',
        statusEndpoint: 'https://status.clicksend.com/api/v2/status.json',
        incidentsEndpoint: 'https://status.clicksend.com/api/v2/incidents/unresolved.json',
        schema: 'statuspage'
    },
    infobip: {
        slug: 'infobip',
        displayName: 'Infobip',
        statusPageUrl: 'https://status.infobip.com',
        statusEndpoint: 'https://status.infobip.com/api/v2/status.json',
        incidentsEndpoint: 'https://status.infobip.com/api/v2/incidents/unresolved.json',
        schema: 'statuspage'
    },
    gupshup: {
        slug: 'gupshup',
        displayName: 'GupShup',
        statusPageUrl: 'https://view.gupshup.io',
        statusEndpoint:
            'https://view.gupshup.io/sp/api/public/summary_details/statuspages/NC-yLCBPu6G_8PifX5UHH2jhvXzSP5spZnEL2C_Ajl4=?period=2&timezone=Australia/LHI',
        incidentsEndpoint: null,
        schema: 'gupshup'
    }
};

const VALID_INDICATORS = new Set(['none', 'minor', 'major', 'critical', 'unknown']);

const normalizeIndicator = (value: any): SmsGatewayStatus['indicator'] => {
    const indicator = String(value || '').trim().toLowerCase();
    return (VALID_INDICATORS.has(indicator) ? indicator : 'unknown') as SmsGatewayStatus['indicator'];
};

// Fetch with a hard 5s timeout via AbortController. Returns the Response or
// null on timeout/network error so callers can branch without try/catch noise.
const fetchWithTimeout = async (url: string): Promise<Response | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        return await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal
        });
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
};

// Count of active (unresolved) incidents. Never throws — defaults to 0 so a
// failed incidents fetch can't sink the main status result.
const fetchActiveDowntimes = async (def: GatewayDefinition): Promise<number> => {
    if (!def.incidentsEndpoint) {
        return 0;
    }

    const response = await fetchWithTimeout(def.incidentsEndpoint);
    if (!response || !response.ok) {
        return 0;
    }

    try {
        const payload: any = await response.json();
        return Array.isArray(payload?.incidents) ? payload.incidents.length : 0;
    } catch {
        return 0;
    }
};

const probeStatuspage = async (def: GatewayDefinition, checkedAt: string): Promise<SmsGatewayStatus> => {
    // Status + active incident count run concurrently per gateway.
    const [statusResponse, activeDowntimes] = await Promise.all([
        fetchWithTimeout(def.statusEndpoint),
        fetchActiveDowntimes(def)
    ]);

    if (!statusResponse) {
        return {
            gateway: def.slug,
            displayName: def.displayName,
            indicator: 'unknown',
            description: 'Status check failed',
            statusPageUrl: def.statusPageUrl,
            checkedAt,
            httpStatus: null,
            activeDowntimes
        };
    }

    if (!statusResponse.ok) {
        return {
            gateway: def.slug,
            displayName: def.displayName,
            indicator: 'unknown',
            description: 'Status check failed',
            statusPageUrl: def.statusPageUrl,
            checkedAt,
            httpStatus: statusResponse.status,
            activeDowntimes
        };
    }

    let payload: any = {};
    try {
        payload = await statusResponse.json();
    } catch {
        payload = {};
    }

    return {
        gateway: def.slug,
        displayName: def.displayName,
        indicator: normalizeIndicator(payload?.status?.indicator),
        description: String(payload?.status?.description || 'Status unavailable').trim(),
        statusPageUrl: def.statusPageUrl,
        checkedAt,
        httpStatus: statusResponse.status,
        activeDowntimes
    };
};

// GupShup proprietary status API. Defensive parsing per the contract:
//  - HTTP 200 + valid JSON => UP (indicator: none), unless a recognizable
//    status field on the body says otherwise.
//  - HTTP >= 400 or network error/timeout => DOWN (indicator: major).
const probeGupshup = async (def: GatewayDefinition, checkedAt: string): Promise<SmsGatewayStatus> => {
    const response = await fetchWithTimeout(def.statusEndpoint);

    if (!response) {
        return {
            gateway: def.slug,
            displayName: def.displayName,
            indicator: 'major',
            description: 'Status check failed',
            statusPageUrl: def.statusPageUrl,
            checkedAt,
            httpStatus: null,
            activeDowntimes: 0
        };
    }

    if (response.status >= 400) {
        return {
            gateway: def.slug,
            displayName: def.displayName,
            indicator: 'major',
            description: 'Service disruption reported',
            statusPageUrl: def.statusPageUrl,
            checkedAt,
            httpStatus: response.status,
            activeDowntimes: 0
        };
    }

    let payload: any = null;
    try {
        payload = await response.json();
    } catch {
        // 200 but body isn't valid JSON — treat as DOWN per contract.
        return {
            gateway: def.slug,
            displayName: def.displayName,
            indicator: 'major',
            description: 'Unexpected status response',
            statusPageUrl: def.statusPageUrl,
            checkedAt,
            httpStatus: response.status,
            activeDowntimes: 0
        };
    }

    // If the body carries an explicit status string, surface it; otherwise a
    // valid 200 JSON body means all good.
    const rawStatus = payload?.overall_status ?? payload?.status ?? payload?.indicator;
    if (typeof rawStatus === 'string' && rawStatus.trim()) {
        const value = rawStatus.trim().toLowerCase();
        const operational = ['none', 'up', 'operational', 'ok', 'good', 'available', 'all systems operational'].includes(value);
        const degraded = ['minor', 'degraded', 'partial', 'maintenance'].includes(value);
        return {
            gateway: def.slug,
            displayName: def.displayName,
            indicator: operational ? 'none' : degraded ? 'minor' : 'major',
            description: rawStatus.trim(),
            statusPageUrl: def.statusPageUrl,
            checkedAt,
            httpStatus: response.status,
            activeDowntimes: 0
        };
    }

    return {
        gateway: def.slug,
        displayName: def.displayName,
        indicator: 'none',
        description: 'All Systems Operational',
        statusPageUrl: def.statusPageUrl,
        checkedAt,
        httpStatus: response.status,
        activeDowntimes: 0
    };
};

const probeGateway = async (def: GatewayDefinition): Promise<SmsGatewayStatus> => {
    const checkedAt = new Date().toISOString();
    try {
        return def.schema === 'gupshup'
            ? await probeGupshup(def, checkedAt)
            : await probeStatuspage(def, checkedAt);
    } catch {
        // Belt-and-braces: any unexpected throw maps to a soft "unknown".
        return {
            gateway: def.slug,
            displayName: def.displayName,
            indicator: 'unknown',
            description: 'Status check failed',
            statusPageUrl: def.statusPageUrl,
            checkedAt,
            httpStatus: null,
            activeDowntimes: 0
        };
    }
};

export const SmsGatewayService = {
    isValidGateway(value: any): value is SmsGatewaySlug {
        return typeof value === 'string' && value in GATEWAYS;
    },

    // Single gateway probe (used by the ?gateway= query param).
    async getStatus(gateway: SmsGatewaySlug): Promise<SmsGatewayStatus> {
        return probeGateway(GATEWAYS[gateway]);
    },

    // All four gateways probed in parallel. Promise.allSettled so one slow or
    // throwing probe can't reject the whole batch.
    async getAllStatuses(): Promise<SmsGatewayStatus[]> {
        const defs = Object.values(GATEWAYS);
        const settled = await Promise.allSettled(defs.map((def) => probeGateway(def)));

        return settled.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            }
            const def = defs[index];
            return {
                gateway: def.slug,
                displayName: def.displayName,
                indicator: 'unknown' as const,
                description: 'Status check failed',
                statusPageUrl: def.statusPageUrl,
                checkedAt: new Date().toISOString(),
                httpStatus: null,
                activeDowntimes: 0
            };
        });
    }
};
