import crypto from 'node:crypto';
import { prisma } from '@kpi-platform/db';

const VAULT_ALGORITHM = 'aes-256-gcm';
const VAULT_MASTER_KEY = process.env.VAULT_MASTER_KEY || 'default-32-byte-master-key-must-be-safe-!@#';
const STRIPE_STATUS_ENDPOINT = 'https://www.stripestatus.com/api/v2/summary.json';

const RAZORPAY_TEST_CREDENTIALS = {
    key: process.env.RAZORPAY_TEST_KEY ?? 'rzp_test_eyVt6S8U4EHLjc',
    secret: process.env.RAZORPAY_TEST_SECRET ?? 'evl4XTF4UP1w8YjIRgE6SRG'
};

const PAYU_TEST_CREDENTIALS = {
    key: process.env.PAYU_TEST_KEY ?? '',
    salt: process.env.PAYU_TEST_SALT ?? ''
};

const PAYU_DOWNTIME_ENDPOINT = 'https://test.payu.in/merchant/postservice.php?form=2';
const PAYU_DOWNTIME_COMMAND = 'getIssuingBankDownBins';

const DEFAULT_TIMEOUT_MS = 8_000;

type GatewayStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN';

type GatewayStatusRecord = {
    gatewayName: string;
    label: string;
    status: GatewayStatus;
    checkedAt: string;
    activeDowntimes: any[];
    downtimeSummary: string[];
    errorMessage?: string;
    configId: string;
    isActive: boolean;
    source: string;
};

type GatewayConfigRow = {
    id: string;
    connectorInstanceId: string | null;
    gatewayName: string;
    label: string;
    apiKey: string | null;
    apiSecret: string | null;
    isActive: boolean;
    metadata?: Record<string, any> | null;
    lastCheckedAt?: Date | string | null;
    lastPayload?: Record<string, any> | null;
    lastStatus?: string | null;
};

type GatewayConfigView = {
    id: string;
    gatewayName: string;
    label: string;
    isActive: boolean;
    lastCheckedAt: string | null;
    lastStatus: string | null;
};

const normalizeGatewayName = (gatewayName: string) => gatewayName.trim().toLowerCase();

const encryptCredential = (value: string) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
        VAULT_ALGORITHM,
        Buffer.from(VAULT_MASTER_KEY.padEnd(32).slice(0, 32)),
        iv
    );

    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

const decryptCredential = (value: string | null | undefined) => {
    if (!value) {
        return null;
    }

    try {
        const payload = Buffer.from(value, 'base64');

        if (payload.length <= 28) {
            return value;
        }

        const iv = payload.subarray(0, 12);
        const tag = payload.subarray(12, 28);
        const text = payload.subarray(28);

        const decipher = crypto.createDecipheriv(
            VAULT_ALGORITHM,
            Buffer.from(VAULT_MASTER_KEY.padEnd(32).slice(0, 32)),
            iv
        );

        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([decipher.update(text), decipher.final()]).toString('utf8');
        return decrypted;
    } catch {
        return value;
    }
};

const decryptGatewayRow = (config: GatewayConfigRow): GatewayConfigRow => ({
    ...config,
    apiKey: decryptCredential(config.apiKey),
    apiSecret: decryptCredential(config.apiSecret)
});

const normalizeStripeMaintenanceItems = (items: any[]) => {
    return items
        .map((item) => {
            if (!item || typeof item !== 'object') {
                return null;
            }

            const name = String(item?.name || item?.title || 'Scheduled maintenance').trim();
            const scheduledFor = item?.scheduled_for || null;
            const scheduledUntil = item?.scheduled_until || null;
            const body = Array.isArray(item?.incident_updates) && item.incident_updates.length > 0
                ? String(item.incident_updates[0]?.body || '').trim()
                : '';

            return {
                id: String(item?.id || name || crypto.randomUUID()),
                method: 'maintenance',
                entity: 'scheduled_maintenance',
                status: String(item?.status || 'scheduled').toLowerCase(),
                severity: String(item?.impact || 'maintenance').toLowerCase(),
                instrument: {
                    name,
                    bank: name,
                    scheduledFor,
                    scheduledUntil
                },
                scheduledFor,
                scheduledUntil,
                description: body || String(item?.incident_updates?.[0]?.body || '').trim() || 'Scheduled maintenance'
            };
        })
        .filter(Boolean);
};

const inferDowntimeStatus = (items: any[]): GatewayStatus => {
    if (!Array.isArray(items) || items.length === 0) {
        return 'UP';
    }

    const upStatuses = items
        .map((item) => item?.up_status)
        .filter((value) => value !== undefined && value !== null)
        .map((value) => Number(value));

    if (upStatuses.length > 0) {
        if (upStatuses.some((value) => Number.isFinite(value) && value === 0)) {
            return 'DOWN';
        }

        return 'UP';
    }

    const severities = items
        .map((item) => String(item?.severity || item?.status || '').toLowerCase())
        .filter(Boolean);

    if (severities.some((severity) => ['down', 'critical', 'high', 'sev-1', 'sev1'].includes(severity))) {
        return 'DOWN';
    }

    return 'DEGRADED';
};

const buildGatewayPayload = (
    gatewayName: string,
    status: GatewayStatus,
    activeDowntimes: any[],
    checkedAt = new Date(),
    extra: Record<string, any> = {}
) => ({
    gateway: gatewayName,
    status,
    checked_at: checkedAt.toISOString(),
    active_downtimes: activeDowntimes,
    ...extra
});

const formatDowntimeSummary = (item: any) => {
    const method = String(item?.method || item?.entity || 'unknown').trim();
    const bank = String(item?.instrument?.bank || item?.instrument?.name || '').trim();

    if (method && bank) {
        return `${method} (${bank})`;
    }

    if (method) {
        return method;
    }

    if (bank) {
        return bank;
    }

    return String(item?.id || item?.status || 'Unknown downtime');
};

const dedupeDowntimeItems = (items: any[]) => {
    const seen = new Set<string>();

    return items.filter((item) => {
        const key = [
            String(item?.id || ''),
            String(item?.method || item?.entity || ''),
            String(item?.instrument?.bank || item?.instrument?.name || '')
        ].join('|');

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
};

const buildPayUHash = (key: string, command: string, var1: string, salt: string) => {
    const hashString = `${String(key).trim()}|${String(command).trim()}|${String(var1).trim()}|${String(salt).trim()}`;
    const hash = crypto.createHash('sha512').update(hashString).digest('hex');

    return hash;
};

const normalizePayUDowntimeItems = (items: any[]) => {
    return items
        .map((item) => {
            if (item && typeof item === 'object') {
                const bank = String(
                    item?.title ||
                    item?.bank ||
                    item?.bankName ||
                    item?.issuer ||
                    item?.name ||
                    ''
                ).trim();
                const bins = Array.isArray(item?.bins_arr)
                    ? item.bins_arr.map((bin: any) => String(bin).trim()).filter(Boolean)
                    : [];
                const bin = String(item?.bin || item?.downBin || item?.down_bins || item?.value || bins[0] || '').trim();
                const method = String(item?.method || item?.entity || item?.paymentMethod || 'card').trim() || 'card';

                return {
                    ...item,
                    method,
                    instrument: {
                        ...(item?.instrument && typeof item.instrument === 'object' ? item.instrument : {}),
                        bank: bank || String(item?.instrument?.bank || item?.instrument?.name || '').trim(),
                        bin: bin || String(item?.instrument?.bin || '').trim(),
                        bins
                    }
                };
            }

            const value = String(item ?? '').trim();

            if (!value) {
                return null;
            }

            return {
                method: 'card',
                status: 'down',
                instrument: {
                    bank: value,
                    bin: value
                }
            };
        })
        .filter(Boolean);
};

const extractPayUItems = (payload: any) => {
    const candidates = [
        payload?.items,
        payload?.data,
        payload?.result,
        payload?.response,
        payload?.downBins,
        payload?.down_bins,
        payload?.bins,
        payload?.bankList,
        payload?.banks,
        payload?.activeDowntimes
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            return candidate;
        }
    }

    if (Array.isArray(payload)) {
        return payload;
    }

    if (payload && typeof payload === 'object') {
        return Object.values(payload);
    }

    return [];
};

const parseResponsePayload = async (response: Response) => {
    const rawText = await response.text();

    if (!rawText) {
        return {};
    }

    try {
        return JSON.parse(rawText);
    } catch {
        return { raw: rawText };
    }
};

const isPayUHashError = (payload: any) => {
    const message = String(payload?.msg || payload?.message || payload?.error || '').toLowerCase();
    return message.includes('invalid hash');
};

type PayUCommandResult = {
    command: string;
    var1: string;
    var2?: number;
    ok: boolean;
    status: GatewayStatus;
    activeDowntimes: any[];
    response: any;
    errorMessage?: string;
};

const fetchPayUCommand = async (
    key: string,
    salt: string,
    command: string,
    var1: string,
    controller: AbortController,
    var2?: number
): Promise<PayUCommandResult> => {
    const hash = buildPayUHash(key, command, var1, salt);
    const body = new URLSearchParams();

    body.append('key', key);
    body.append('command', command);
    body.append('var1', var1);

    if (var2 !== undefined && var2 !== null) {
        body.append('var2', String(var2));
    }

    body.append('hash', hash);

    try {
        const response = await fetch(PAYU_DOWNTIME_ENDPOINT, {
            method: 'POST',
            headers: {
                Accept: 'application/json, text/plain, */*'
            },
            body,
            signal: controller.signal
        });

        const payload = await parseResponsePayload(response);
        if (isPayUHashError(payload)) {
            return {
                command,
                var1,
                var2,
                ok: false,
                status: 'UNKNOWN',
                activeDowntimes: [],
                response: payload,
                errorMessage: payload?.msg || payload?.message || 'Invalid Hash.'
            };
        }

        if (!response.ok) {
            return {
                command,
                var1,
                var2,
                ok: false,
                status: 'UNKNOWN',
                activeDowntimes: [],
                response: payload,
                errorMessage: payload?.message || payload?.error || `PayU API responded with HTTP ${response.status}`
            };
        }

        const rawItems = extractPayUItems(payload);
        const filteredItems = command === 'getNetbankingStatus'
            ? rawItems.filter(
                (item) =>
                    String(item?.mode || '').toUpperCase() === 'NB' &&
                    Number(item?.up_status) === 0
            )
            : rawItems;
        const activeDowntimes = normalizePayUDowntimeItems(filteredItems);
        const status = command === PAYU_DOWNTIME_COMMAND
            ? (activeDowntimes.length > 0 ? 'DOWN' : 'UP')
            : inferDowntimeStatus(activeDowntimes);

        return {
            command,
            var1,
            var2,
            ok: true,
            status,
            activeDowntimes,
            response: payload
        };
    } catch (error: any) {
        const message = error?.name === 'AbortError'
            ? 'PayU downtime request timed out'
            : error?.message || 'Failed to reach PayU downtime API';

        return {
            command,
            var1,
            var2,
            ok: false,
            status: 'UNKNOWN',
            activeDowntimes: [],
            response: null,
            errorMessage: message
        };
    }
};

const fetchRazorpayDowntimes = async (config?: GatewayConfigRow) => {
    const checkedAt = new Date();
    const key = config?.apiKey || RAZORPAY_TEST_CREDENTIALS.key;
    const secret = config?.apiSecret || RAZORPAY_TEST_CREDENTIALS.secret;
    const authHeader = `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
        const response = await fetch('https://api.razorpay.com/v1/payments/downtimes', {
            method: 'GET',
            headers: {
                Authorization: authHeader,
                Accept: 'application/json'
            },
            signal: controller.signal
        });

        if (!response.ok) {
            return buildGatewayPayload('Razorpay', 'UNKNOWN', [], checkedAt, {
                error: true,
                error_message: `Razorpay API responded with HTTP ${response.status}`
            });
        }

        const payload = await response.json().catch(() => ({}));
        const rawItems = Array.isArray(payload?.items)
            ? payload.items
            : Array.isArray(payload)
                ? payload
                : [];

        return buildGatewayPayload('Razorpay', inferDowntimeStatus(rawItems), rawItems, checkedAt);
    } catch (error: any) {
        const message = error?.name === 'AbortError'
            ? 'Razorpay downtime request timed out'
            : error?.message || 'Failed to reach Razorpay downtime API';

        return buildGatewayPayload('Razorpay', 'UNKNOWN', [], checkedAt, {
            error: true,
            error_message: message
        });
    } finally {
        clearTimeout(timeout);
    }
};

const fetchPayUDowntimes = async (config?: GatewayConfigRow) => {
    const checkedAt = new Date();
    const key = config?.apiKey || PAYU_TEST_CREDENTIALS.key;
    const salt = config?.apiSecret || PAYU_TEST_CREDENTIALS.salt;

    if (!key || !salt) {
        return buildGatewayPayload('PayU', 'UNKNOWN', [], checkedAt, {
            error: true,
            error_message: 'PayU key and salt are required to check downtime'
        });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
        const [netbankingResult, issuingBankDownBinsResult] = await Promise.all([
            fetchPayUCommand(key, salt, 'getNetbankingStatus', 'default', controller),
            fetchPayUCommand(key, salt, PAYU_DOWNTIME_COMMAND, 'default', controller, 1)
        ]);

        const combinedItems = dedupeDowntimeItems([
            ...netbankingResult.activeDowntimes,
            ...issuingBankDownBinsResult.activeDowntimes
        ]);
        const inferredStatus = inferDowntimeStatus(combinedItems);
        const errors = [netbankingResult.errorMessage, issuingBankDownBinsResult.errorMessage].filter(Boolean);
        const status = errors.length > 0
            ? (inferredStatus === 'DOWN' ? 'DOWN' : 'DEGRADED')
            : inferredStatus;

        return buildGatewayPayload('PayU', status, combinedItems, checkedAt, {
            response: {
                netbankingStatus: {
                    command: netbankingResult.command,
                    var1: netbankingResult.var1,
                    status: netbankingResult.status,
                    active_downtimes: netbankingResult.activeDowntimes,
                    response: netbankingResult.response,
                    error_message: netbankingResult.errorMessage || null
                },
                issuingBankDownBins: {
                    command: issuingBankDownBinsResult.command,
                    var1: issuingBankDownBinsResult.var1,
                    var2: issuingBankDownBinsResult.var2,
                    status: issuingBankDownBinsResult.status,
                    active_downtimes: issuingBankDownBinsResult.activeDowntimes,
                    response: issuingBankDownBinsResult.response,
                    error_message: issuingBankDownBinsResult.errorMessage || null
                }
            },
            command: 'getNetbankingStatus+getIssuingBankDownBins',
            errors: errors.length ? errors : undefined
        });
    } catch (error: any) {
        const message = error?.name === 'AbortError'
            ? 'PayU downtime request timed out'
            : error?.message || 'Failed to reach PayU downtime API';

        return buildGatewayPayload('PayU', 'UNKNOWN', [], checkedAt, {
            error: true,
            error_message: message
        });
    } finally {
        clearTimeout(timeout);
    }
};

const fetchStripeStatus = async () => {
    const checkedAt = new Date();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
        const response = await fetch(STRIPE_STATUS_ENDPOINT, {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            },
            signal: controller.signal
        });

        const payload = await response.json().catch(() => ({}));
        const scheduledMaintenances = Array.isArray(payload?.scheduled_maintenances)
            ? payload.scheduled_maintenances
            : [];
        const activeDowntimes = normalizeStripeMaintenanceItems(scheduledMaintenances);

        const indicator = String(payload?.status?.indicator || '').toLowerCase();
        const statusDescription = String(payload?.status?.description || '').trim();
        const baseStatus: GatewayStatus = indicator === 'none' || indicator === 'operational'
            ? 'UP'
            : indicator === 'minor'
                ? 'DEGRADED'
                : indicator === 'major' || indicator === 'critical'
                    ? 'DOWN'
                    : 'UNKNOWN';
        const status = activeDowntimes.length > 0 && baseStatus === 'UP' ? 'DEGRADED' : baseStatus;

        return buildGatewayPayload('Stripe', status, activeDowntimes, checkedAt, {
            source: 'stripestatus-api',
            response: payload,
            status_description: statusDescription,
            scheduled_maintenances: scheduledMaintenances,
            maintenance_count: scheduledMaintenances.length,
            indicator
        });
    } catch (error: any) {
        const message = error?.name === 'AbortError'
            ? 'Stripe status request timed out'
            : error?.message || 'Failed to reach Stripe status API';

        return buildGatewayPayload('Stripe', 'UNKNOWN', [], checkedAt, {
            error: true,
            error_message: message
        });
    } finally {
        clearTimeout(timeout);
    }
};

const fetchGatewayStatusByType = async (config: GatewayConfigRow) => {
    switch (normalizeGatewayName(config.gatewayName)) {
        case 'razorpay':
            return fetchRazorpayDowntimes(config);
        case 'stripe':
            return fetchStripeStatus();
        case 'payu':
            return fetchPayUDowntimes(config);
        default:
            return buildGatewayPayload(config.gatewayName, 'UNKNOWN', [], new Date(), {
                error: true,
                error_message: `Gateway "${config.gatewayName}" is not supported yet`
            });
    }
};

const getConfiguredGatewayRows = async (
    siteId: string,
    tenantId: string,
    connectorInstanceId?: string | null
) => {
    // When a specific store (connector) is selected we scope to it; when no
    // connector is passed (e.g. the "All Stores" view) we return every
    // configured gateway for the project.
    const rows = connectorInstanceId
        ? await prisma.$queryRaw<GatewayConfigRow[]>`
            SELECT
                id,
                connector_instance_id AS "connectorInstanceId",
                gateway_name AS "gatewayName",
                label,
                api_key AS "apiKey",
                api_secret AS "apiSecret",
                is_active AS "isActive",
                metadata,
                last_checked_at AS "lastCheckedAt",
                last_payload AS "lastPayload",
                last_status AS "lastStatus"
            FROM payment_gateway_configs
            WHERE project_id = ${siteId}
              AND tenant_id = ${tenantId}
              AND connector_instance_id = ${connectorInstanceId}
              AND is_active = true
            ORDER BY created_at ASC
        `
        : await prisma.$queryRaw<GatewayConfigRow[]>`
            SELECT
                id,
                connector_instance_id AS "connectorInstanceId",
                gateway_name AS "gatewayName",
                label,
                api_key AS "apiKey",
                api_secret AS "apiSecret",
                is_active AS "isActive",
                metadata,
                last_checked_at AS "lastCheckedAt",
                last_payload AS "lastPayload",
                last_status AS "lastStatus"
            FROM payment_gateway_configs
            WHERE project_id = ${siteId}
              AND tenant_id = ${tenantId}
              AND is_active = true
            ORDER BY created_at ASC
        `;

        return rows.map(decryptGatewayRow);
};

// Default provisioning of a demo gateway has been removed.
// The platform will no longer auto-insert a test Razorpay config.

const persistGatewaySnapshot = async (
    config: GatewayConfigRow,
    siteId: string,
    tenantId: string,
    payload: any
) => {
    const checkedAt = new Date(payload.checked_at || new Date().toISOString());

    await prisma.$executeRaw`
        UPDATE payment_gateway_configs
        SET
            last_checked_at = ${checkedAt},
            last_status = ${payload.status},
            last_payload = ${JSON.stringify(payload)}::jsonb,
            is_active = true,
            updated_at = NOW()
        WHERE id = ${config.id}
    `;

    await prisma.$executeRaw`
        INSERT INTO payment_gateway_status_snapshots (
            id,
            payment_gateway_config_id,
            project_id,
            tenant_id,
            connector_instance_id,
            gateway_name,
            status,
            active_downtimes,
            payload,
            checked_at,
            source,
            error_message
        )
        VALUES (
            ${crypto.randomUUID()},
            ${config.id},
            ${siteId},
            ${tenantId},
            ${config.connectorInstanceId ?? null},
            ${config.gatewayName},
            ${payload.status},
            ${JSON.stringify(Array.isArray(payload.active_downtimes) ? payload.active_downtimes : [])}::jsonb,
            ${JSON.stringify(payload)}::jsonb,
            ${checkedAt},
            'journey-refresh',
            ${payload.error_message || null}
        )
    `;

    return checkedAt.toISOString();
};

const mapSnapshotRecord = (
    config: GatewayConfigRow,
    payload: any,
    source: string
): GatewayStatusRecord => {
    const checkedAt = payload?.checked_at || new Date().toISOString();
    const activeDowntimes = dedupeDowntimeItems(Array.isArray(payload?.active_downtimes) ? payload.active_downtimes : []);

    return {
        gatewayName: config.gatewayName,
        label: config.label || config.gatewayName,
        status: payload?.status || 'UNKNOWN',
        checkedAt,
        activeDowntimes,
        downtimeSummary: activeDowntimes.map(formatDowntimeSummary),
        errorMessage: payload?.error_message,
        configId: config.id,
        isActive: config.isActive,
        source
    };
};

const mapPublicGatewayConfig = (row: any): GatewayConfigView => ({
    id: row.id,
    gatewayName: row.gatewayName,
    label: row.label,
    isActive: row.isActive,
    lastCheckedAt: row.lastCheckedAt ? new Date(row.lastCheckedAt).toISOString() : null,
    lastStatus: row.lastStatus || null
});

export const PaymentGatewayService = {
    async getConfiguredGateways(siteId: string, tenantId: string, connectorInstanceId?: string | null) {
        if (!siteId || !tenantId) {
            return [] as GatewayConfigRow[];
        }

        const configs = await getConfiguredGatewayRows(siteId, tenantId, connectorInstanceId);

        // Return whatever explicit configs exist for the project (may be empty).
        return configs;
    },

    async syncConfiguredGateways(siteId: string, tenantId: string, connectorInstanceId?: string | null): Promise<GatewayStatusRecord[]> {
        const configs = await this.getConfiguredGateways(siteId, tenantId, connectorInstanceId);

        if (!configs.length) {
            return [];
        }

        const statuses = await Promise.all(
            configs.map(async (config) => {
                const payload: any = await fetchGatewayStatusByType(config);

                const checkedAt = await persistGatewaySnapshot(config, siteId, tenantId, payload);

                return mapSnapshotRecord(config, {
                    ...payload,
                    checked_at: checkedAt
                }, 'journey-refresh');
            })
        );

        return statuses;
    },

    async getLatestGatewaySnapshots(siteId: string, tenantId: string, connectorInstanceId?: string | null): Promise<GatewayStatusRecord[]> {
        if (!siteId || !tenantId) {
            return [];
        }

        const rows = connectorInstanceId
            ? await prisma.$queryRaw<any[]>`
                SELECT DISTINCT ON (s.payment_gateway_config_id)
                    s.id,
                    s.payment_gateway_config_id AS "configId",
                    s.gateway_name AS "gatewayName",
                    s.status,
                    s.active_downtimes AS "activeDowntimes",
                    s.checked_at AS "checkedAt",
                    s.source,
                    s.error_message AS "errorMessage",
                    c.label,
                    c.is_active AS "isActive"
                FROM payment_gateway_status_snapshots s
                INNER JOIN payment_gateway_configs c ON c.id = s.payment_gateway_config_id
                WHERE s.project_id = ${siteId}
                  AND s.tenant_id = ${tenantId}
                  AND s.connector_instance_id = ${connectorInstanceId}
                ORDER BY s.payment_gateway_config_id, s.checked_at DESC
            `
            : await prisma.$queryRaw<any[]>`
                SELECT DISTINCT ON (s.payment_gateway_config_id)
                    s.id,
                    s.payment_gateway_config_id AS "configId",
                    s.gateway_name AS "gatewayName",
                    s.status,
                    s.active_downtimes AS "activeDowntimes",
                    s.checked_at AS "checkedAt",
                    s.source,
                    s.error_message AS "errorMessage",
                    c.label,
                    c.is_active AS "isActive"
                FROM payment_gateway_status_snapshots s
                INNER JOIN payment_gateway_configs c ON c.id = s.payment_gateway_config_id
                WHERE s.project_id = ${siteId}
                  AND s.tenant_id = ${tenantId}
                ORDER BY s.payment_gateway_config_id, s.checked_at DESC
            `;

        return rows.map((row) => {
            const activeDowntimes = dedupeDowntimeItems(Array.isArray(row.activeDowntimes) ? row.activeDowntimes : []);

            return {
                gatewayName: row.gatewayName,
                label: row.label || row.gatewayName,
                status: row.status || 'UNKNOWN',
                checkedAt: row.checkedAt ? new Date(row.checkedAt).toISOString() : new Date().toISOString(),
                activeDowntimes,
                downtimeSummary: activeDowntimes.map(formatDowntimeSummary),
                errorMessage: row.errorMessage || null,
                configId: row.configId,
                isActive: row.isActive,
                source: row.source || 'db-latest-snapshot'
            };
        });
    },

    async checkGatewayDowntime(gatewayName: string) {
        const config = {
            id: crypto.randomUUID(),
            connectorInstanceId: null,
            gatewayName,
            label: gatewayName,
            apiKey: null,
            apiSecret: null,
            isActive: true
        } as GatewayConfigRow;

        const payload: any = await fetchGatewayStatusByType(config);
        return buildGatewayPayload(gatewayName, payload.status, payload.active_downtimes, new Date(payload.checked_at), {
            ...payload
        });
    },

    async upsertGatewayConfig(
        siteId: string,
        tenantId: string,
        input: { gatewayName: string; label?: string; apiKey?: string; apiSecret?: string; metadata?: Record<string, unknown> },
        connectorInstanceId?: string | null
    ): Promise<GatewayConfigView | null> {
        // A gateway config belongs to one connected store — the caller must have a
        // specific store selected (not the "All Stores" view) to configure one.
        if (!connectorInstanceId) {
            throw new Error('Select a specific store before configuring a payment gateway.');
        }

        const gatewayName = normalizeGatewayName(input.gatewayName || 'razorpay');

        if (gatewayName !== 'razorpay' && gatewayName !== 'payu' && gatewayName !== 'stripe') {
            throw new Error('Only Razorpay, Stripe and PayU gateway configurations are supported right now.');
        }

        const label = input.label?.trim() || (gatewayName === 'payu' ? 'PayU' : gatewayName === 'stripe' ? 'Stripe' : 'Razorpay');
        const apiKey = input.apiKey?.trim() || null;
        const apiSecret = input.apiSecret?.trim() || null;

        if (gatewayName !== 'stripe' && (!apiKey || !apiSecret)) {
            throw new Error(`${label} key and secret are required.`);
        }

        const metadata = {
            provisionedBy: 'journey-config',
            scope: 'manual',
            ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {})
        };

        await prisma.$executeRaw`
            INSERT INTO payment_gateway_configs (
                id,
                project_id,
                tenant_id,
                connector_instance_id,
                gateway_name,
                label,
                api_key,
                api_secret,
                is_active,
                metadata,
                created_at,
                updated_at
            )
            VALUES (
                ${crypto.randomUUID()},
                ${siteId},
                ${tenantId},
                ${connectorInstanceId},
                ${gatewayName},
                ${label},
                ${apiKey ? encryptCredential(apiKey) : null},
                ${apiSecret ? encryptCredential(apiSecret) : null},
                true,
                ${JSON.stringify(metadata)}::jsonb,
                NOW(),
                NOW()
            )
            ON CONFLICT (project_id, tenant_id, connector_instance_id, gateway_name)
            DO UPDATE SET
                label = EXCLUDED.label,
                api_key = EXCLUDED.api_key,
                api_secret = EXCLUDED.api_secret,
                metadata = EXCLUDED.metadata,
                is_active = true,
                updated_at = NOW()
        `;

        const rows = await prisma.$queryRaw<any[]>`
            SELECT
                id,
                gateway_name AS "gatewayName",
                label,
                is_active AS "isActive",
                last_checked_at AS "lastCheckedAt",
                last_status AS "lastStatus"
            FROM payment_gateway_configs
            WHERE project_id = ${siteId}
              AND tenant_id = ${tenantId}
              AND connector_instance_id = ${connectorInstanceId}
              AND gateway_name = ${gatewayName}
            LIMIT 1
        `;

        return rows[0] ? mapPublicGatewayConfig(rows[0]) : null;
    }
};