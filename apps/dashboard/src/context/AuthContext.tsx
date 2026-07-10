//apps/dashboard/src/context/AuthContext.tsx
'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { connectorFilterStore } from '../lib/connectorFilterStore';
import { normalizeRole } from '@kpi-platform/shared-types';

const getConnectorBridgeResponse = (url: string) => {
    if (typeof window === 'undefined') return undefined;
    if (process.env.NEXT_PUBLIC_USE_CONNECTOR_BRIDGE !== 'true') return undefined;

    if (url.includes('/resync')) {
        return undefined;
    }

    const bridge = (window as any).__kpiConnectorPlatform;
    if (!bridge) return undefined;

    const orders = bridge.canonicalOrders || [];
    const customers = bridge.canonicalCustomers || [];
    const products = bridge.canonicalProducts || [];
    const alerts = bridge.alerts || [];
    const incidents = bridge.incidents || [];
    const jobs = bridge.jobs || [];
    const ingestionEvents = bridge.ingestionEvents || [];
    const connectedStores = bridge.connectedStores || [];
    const shouldUseBridgeIntegrations = connectedStores.length > 0;
    const selectedConnectorId = connectorFilterStore.getActiveConnectorId() || bridge.activeStoreId;
    const selectedStore = connectedStores.find((store: any) => store.connectorId === selectedConnectorId) || null;

    const criticalOrderStatuses = new Set([
        'failed',
        'returned',
        'cancelled',
        'canceled',
        'refunded',
        'dead_lettered',
        'rejected',
        'mismatch'
    ]);

    const isCriticalOrderFailure = (order: any) => {
        const status = String(
            order?.status ||
            order?.normalizedStatus ||
            order?.lifecycleState ||
            order?.syncStatus ||
            ''
        ).toLowerCase();

        return criticalOrderStatuses.has(status);
    };

    const extractBridgeOrderEmail = (order: any): string | undefined => {
        const metadata = order?.metadata || {};
        const rawOrder = metadata?.rawOrder || metadata?.bigcommerceOrder || metadata?.adobeOrder || {};

        return (
            order?.email ||
            order?.customerEmail ||
            order?.buyerEmail ||
            order?.billing_email ||
            metadata?.email ||
            metadata?.customerEmail ||
            metadata?.buyerEmail ||
            metadata?.billing_email ||
            metadata?.customer_email ||
            rawOrder?.email ||
            rawOrder?.customer_email ||
            rawOrder?.billing_email ||
            rawOrder?.billing_address?.email ||
            rawOrder?.shipping_address?.email ||
            metadata?.bigcommerceOrder?.billing_address?.email
        );
    };

    const mapOrder = (order: any) => {
        const metadata = order?.metadata || {};
        const canonicalEmail = extractBridgeOrderEmail(order);

        return {
            // Keep existing shape for orders dashboard consumers
            id: order.id,
            externalOrderId: order.id,
            amount: order.revenue,
            status: order.status === 'pending' ? 'placed' : order.status,
            orderSource: order.source,
            health: selectedStore?.status === 'offline' ? 'critical' : selectedStore?.status === 'degraded' ? 'delayed' : 'healthy',
            syncStatus: order.status === 'fulfilled' ? 'synced' : order.status === 'cancelled' || order.status === 'refunded' ? 'error' : 'pending',
            createdAt: order.createdAt,
            customerId: order.customerId,
            currency: order.currency,
            items: order.items,
            source: order.source,

            // Canonical-style fields for customers page matching
            orderId: String(order?.orderId || order?.externalRefId || order?.id || ''),
            sourceSystem: order?.sourceSystem || order?.source,
            channel: order?.channel || 'online',
            lifecycleState: order?.lifecycleState || order?.status,
            normalizedStatus: order?.normalizedStatus || order?.status,
            totalAmount: order?.totalAmount ?? order?.revenue ?? 0,
            placedAt: order?.placedAt || order?.createdAt,

            // Root-level email fields used by frontend matchers
            email: canonicalEmail,
            customerEmail: canonicalEmail,
            buyerEmail: canonicalEmail,
            billing_email: canonicalEmail,

            // Preserve metadata for deep nested extraction
            metadata: {
                ...metadata,
                ...(canonicalEmail
                    ? {
                        email: metadata?.email || canonicalEmail,
                        customerEmail: metadata?.customerEmail || canonicalEmail,
                        buyerEmail: metadata?.buyerEmail || canonicalEmail,
                        billing_email: metadata?.billing_email || canonicalEmail,
                    }
                    : {}),
            },
        };
    };

    const mappedOrders = orders.map(mapOrder);
    const shouldUseBridgeOrders = orders.length > 0;
    const shouldUseBridgeCustomers = customers.length > 0;

    const mapCustomer = (customer: any) => {
        const email =
            customer?.email ||
            customer?.customerEmail ||
            customer?.contactEmail ||
            customer?.metadata?.email ||
            customer?.rawCustomer?.email ||
            '';

        return {
            id: customer?.id || `bridge-customer-${Math.random().toString(36).slice(2)}`,
            lifecycleState: customer?.lifecycleState || (customer?.orderCount > 1 ? 'RETURNING' : 'NEW_GUEST'),
            firstSeenAt: customer?.firstSeenAt || customer?.createdAt || new Date().toISOString(),
            lastSeenAt: customer?.lastSeenAt || customer?.updatedAt || customer?.createdAt || new Date().toISOString(),
            totalLtv: Number(customer?.totalLtv || customer?.ltv || 0),
            externalIds: customer?.externalIds || {
                bigcommerce: customer?.bigcommerceCustomerId || customer?.customerId || undefined,
            },
            metadata: {
                ...(customer?.metadata || {}),
                email,
                customerEmail: customer?.customerEmail || email,
                contactEmail: customer?.contactEmail || email,
                name: customer?.name || customer?.fullName,
                customerName: customer?.name || customer?.fullName,
                sessionCount: Number(customer?.sessionCount || customer?.sessions || 0),
                orders: Array.isArray(customer?.orders) ? customer.orders : undefined,
                rawCustomer: customer?.rawCustomer || customer,
            },
        };
    };

    if (url.includes('/dashboard/orders/summary')) {
        if (!shouldUseBridgeOrders) return undefined;
        const now = Date.now();
        const recentOrders = orders.filter((order: any) => now - Number(new Date(order.createdAt)) < 1000 * 60 * 60);
        const delayedCount = orders.filter((order: any) => order.status === 'pending' || order.status === 'processing').length;
        const failedCount = orders.filter(isCriticalOrderFailure).length;
        return {
            totalOrders: orders.length,
            ordersThisHour: recentOrders.length,
            onlineSplit: orders.filter((order: any) => order.source === 'shopify' || order.source === 'bigcommerce').length,
            offlineSplit: orders.filter((order: any) => order.source === 'adobe_commerce').length,
            delayedCount,
            failedCount,
            ordersPerMinute: (recentOrders.length / 60).toFixed(2)
        };
    }

    if (url.includes('/dashboard/orders/list')) {
        if (!shouldUseBridgeOrders) return undefined;
        return mappedOrders;
    }

    if (url.includes('/dashboard/customers/summary')) {
        const identified = customers.filter((customer: any) => customer.email && customer.name).length;
        const activeUsers = customers.filter((customer: any) => customer.orderCount > 0).length;
        const returning = customers.filter((customer: any) => customer.orderCount > 1).length;
        return {
            totalUsers: customers.length,
            activeUsers,
            identifiedRatio: customers.length === 0 ? 0 : Math.round((identified / customers.length) * 100),
            newVsReturning: customers.length === 0 ? 0 : Math.round((returning / customers.length) * 100),
            sessions: connectedStores.reduce((sum: number, store: any) => sum + (store.recordsByType?.sessions || 0), 0)
        };
    }

    if (url.includes('/dashboard/customers/list')) {
        if (!shouldUseBridgeCustomers) return undefined;
        return customers.map(mapCustomer);
    }

    if (url.includes('/dashboard/customers/intelligence')) {
        return {
            funnel: [
                { stage: 'Visit', count: 4200, percent: 100 },
                { stage: 'Product View', count: 2400, percent: 57 },
                { stage: 'Add to Cart', count: 1200, percent: 29 },
                { stage: 'Purchase', count: orders.length, percent: 8 }
            ],
            segments: [
                { name: 'Identified Customers', size: identifiedCount(customers), active: Math.max(1, activeUsersCount(customers)), conversion: 11.4, growth: 18 },
                { name: 'Anonymous Guests', size: Math.max(0, customers.length - identifiedCount(customers)), active: 90, conversion: 3.2, growth: 6 }
            ],
            recentIdentities: customers.slice(0, 5).map((customer: any) => ({
                id: customer.id,
                name: customer.name,
                email: customer.email,
                state: customer.tags?.includes('vip') ? 'VIP' : customer.orderCount > 1 ? 'RETURNING' : 'NEW',
                sessions: Math.max(1, customer.orderCount * 3),
                lastActive: customer.createdAt
            })),
            topAttribution: connectedStores.map((store: any) => ({
                source: store.platform === 'shopify' ? 'Shopify' : store.platform === 'adobe_commerce' ? 'Adobe Commerce' : 'BigCommerce',
                conversion: store.healthScore,
                sessions: store.recordsByType?.sessions || 0
            }))
        };
    }

    if (url.includes('/dashboard/alerts')) {
        return { alerts };
    }

    if (url.includes('/dashboard/incidents')) {
        return incidents;
    }

    if (url.includes('/dashboard/performance/trends')) {
        return Array.from({ length: 12 }).map((_, index) => ({
            time: `${index + 1}h`,
            latency: 250 + index * 22 + connectedStores.length * 18,
            errorRate: Math.max(0.2, index % 4 === 0 ? connectedStores.length : 0.3)
        }));
    }

    if (url.includes('/dashboard/performance/anomalies')) {
        return connectedStores.filter((store: any) => store.status !== 'healthy').map((store: any) => ({
            id: `anom_${store.connectorId}`,
            title: `${store.connectionLabel} sync instability`,
            severity: store.status === 'offline' ? 'critical' : 'warning',
            source: store.platform,
            timestamp: store.lastAttemptedSync
        }));
    }

    if (url.includes('/dashboard/performance/regional')) {
        return connectedStores.map((store: any, index: number) => ({
            name: store.connectionLabel,
            share: Math.max(0.1, 1 / Math.max(connectedStores.length, 1)),
            lcp: 1200 + index * 180 + (store.status === 'healthy' ? 0 : 600),
            errorRate: store.status === 'healthy' ? 0.4 : 2.3
        }));
    }

    if (url.includes('/dashboard/performance/slowest-pages')) {
        return [
            // { page: '/checkout', loadTime: 3400, hits: orders.length * 2, errorRate: 2.1 },
            // { page: '/cart', loadTime: 2500, hits: orders.length * 3, errorRate: 1.4 },
            // { page: '/orders', loadTime: 2100, hits: orders.length, errorRate: 0.9 },
            // { page: '/auth', loadTime: 1800, hits: customers.length * 2, errorRate: 0.5 }
        ];
    }

    if (url.includes('/dashboard/integrations/summary')) {
        if (!shouldUseBridgeIntegrations) return undefined;
        return {
            total: connectedStores.length,
            healthy: connectedStores.filter((store: any) => store.status === 'healthy').length,
            degraded: connectedStores.filter((store: any) => store.status === 'degraded').length,
            critical: connectedStores.filter((store: any) => store.status === 'offline').length,
            stale: connectedStores.filter((store: any) => store.initialSyncState !== 'completed').length,
            successRate: bridge.healthScore || 98,
            avgLatency: 420
        };
    }

    if (url.includes('/dashboard/integrations/trends')) {
        if (!shouldUseBridgeIntegrations) return undefined;
        return connectedStores.map((store: any, index: number) => ({
            time: `${index + 1}h`,
            successRate: store.healthScore,
            latency: store.status === 'healthy' ? 320 : 1020
        }));
    }

    if (url.includes('/dashboard/integrations/failed')) {
        if (!shouldUseBridgeIntegrations) return undefined;
        return connectedStores.filter((store: any) => store.status !== 'healthy').map((store: any) => ({
            system: store.name,
            error: store.status === 'offline' ? 'Connector offline' : 'Webhook delivery failure',
            timestamp: store.lastAttemptedSync
        }));
    }

    if (url.includes('/integrations/') && url.includes('/resync/status')) {
        return {
            jobId: 'resync_mock_status',
            status: 'completed',
            syncTargets: ['orders', 'customers'],
            initiatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            error: null
        };
    }

    if (url.includes('/integrations/') && url.includes('/resync') && !url.includes('/status')) {
        return {
            jobId: `resync_mock_${Date.now()}`,
            connectorInstanceId: 'mock_connector_instance',
            syncTargets: ['orders', 'customers'],
            status: 'queued',
            initiatedAt: new Date().toISOString()
        };
    }

    if ((url.includes('/dashboard/integrations/list') || (url.includes('/tenants/current/projects/') && url.includes('/integrations'))) && shouldUseBridgeIntegrations) {
        return connectedStores.map((store: any) => ({
            id: store.connectorId || store.id || store.connectorInstanceId || store.instanceId || null,
            label: store.name,
            providerId: store.platform,
            family: store.platform === 'shopify' ? 'commerce' : 'commerce',
            category: store.platform === 'shopify' ? 'shopify' : 'adobe_commerce',
            healthStatus: store.status,
            healthScore: store.healthScore,
            lastSyncAt: store.lastSuccessfulSync,
            lastWebhookAt: store.webhooksActive ? store.lastSuccessfulSync : null,
            avgLatency: store.status === 'healthy' ? 260 : 860,
            status: store.status === 'healthy' ? 'ACTIVE' : 'DEGRADED'
        }));
    }

    if (url.includes('/dashboard/ingestion/events')) {
        return ingestionEvents;
    }

    if (url.includes('/dashboard/pipeline/jobs')) {
        return { data: { jobs } };
    }

    if (url.includes('/dashboard/kpi/summary')) {
        return {
            data: {
                kpis: [
                    { key: 'revenue', name: 'Revenue', value: orders.reduce((sum: number, order: any) => sum + Number(order.amount || 0), 0), category: 'BUSINESS', freshnessStatus: 'live', lastUpdated: new Date().toISOString() },
                    { key: 'orders', name: 'Order Count', value: orders.length, category: 'OPERATIONAL', freshnessStatus: 'live', lastUpdated: new Date().toISOString() },
                    { key: 'aov', name: 'Average Order Value', value: orders.length ? orders.reduce((sum: number, order: any) => sum + Number(order.amount || 0), 0) / orders.length : 0, category: 'BUSINESS', freshnessStatus: 'live', lastUpdated: new Date().toISOString() },
                    { key: 'conversion', name: 'Conversion Rate', value: 4.8, category: 'EXPERIENCE', freshnessStatus: 'live', lastUpdated: new Date().toISOString() },
                    { key: 'refundRate', name: 'Refund Rate', value: Math.max(0.1, orders.filter((order: any) => order.status === 'refunded').length), category: 'OPERATIONAL', freshnessStatus: 'live', lastUpdated: new Date().toISOString() },
                    { key: 'acquisition', name: 'Customer Acquisition', value: customers.length, category: 'BUSINESS', freshnessStatus: 'live', lastUpdated: new Date().toISOString() }
                ]
            }
        };
    }

    if (url.includes('/dashboard/kpi/catalog')) {
        return {
            data: {
                available: [
                    { key: 'revenue', category: 'BUSINESS' },
                    { key: 'orders', category: 'OPERATIONAL' },
                    { key: 'aov', category: 'BUSINESS' },
                    { key: 'conversion', category: 'EXPERIENCE' },
                    { key: 'refundRate', category: 'OPERATIONAL' },
                    { key: 'acquisition', category: 'BUSINESS' }
                ],
                unavailable: []
            }
        };
    }

    return undefined;
};

const identifiedCount = (customers: any[]) => customers.filter((customer) => !!customer.email).length;
const activeUsersCount = (customers: any[]) => customers.filter((customer) => customer.orderCount > 0).length;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const LONG_RUNNING_REQUEST_TIMEOUT_MS = 120000;

const isLongRunningMutationRequest = (url: string, method?: string) => {
    const normalizedMethod = (method || 'GET').toUpperCase();
    if (normalizedMethod === 'GET') return false;

    return /\/(?:re)?sync(?:\/|\?|$)/.test(url) || /\/integrations(?:\/|$)/.test(url);
};

// Large dashboard list fetches (orders/customers with big `limit`s) can take
// well over the default 10s on stores with thousands of records — the backend
// loads every row plus its metadata blob. Give these the long-running budget so
// they actually complete instead of aborting with "Request timed out…" (which
// also left LTV / repeat-buyer headline stats showing 0).
const isLargeDashboardListRequest = (url: string) =>
    /\/dashboard\/(?:orders|customers)\/list(?:\?|$)/.test(url);

// Endpoints whose failures are feature-specific and must NOT flip the whole app into
// the global "Real-time Feed Interrupted" outage banner. PageSpeed in particular is
// slow and frequently 502s / times out when Google's API is rate-limited — that is a
// local PageSpeed problem, not a platform connectivity outage.
const isOutageExemptRequest = (url: string) => {
    return /\/pagespeed(?:\/|\?|$)/.test(url);
};

interface User {
    id: string;
    email: string;
    name: string;
    role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'PROJECT_ADMIN' | 'OPERATOR' | 'VIEWER' | 'CUSTOMER';
    status: 'active' | 'suspended';
    tenantId: string;
    assignedProjects: string[];
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    currentProject: string | null;
    login: (email: string, password: string) => Promise<void>;
    establishSession: (token: string, user: User) => void;
    logout: () => void;
    setProject: (id: string) => void;
    isLoading: boolean;
    apiFetch: (url: string, options?: any) => Promise<any>;
    outageStatus: 'none' | 'stale' | 'expired';
    lastUpdated: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_STORAGE_KEYS = ['session-token', 'session-user', 'current-project'] as const;

// Once a request detects an expired session and triggers the redirect to /login,
// any other in-flight or subsequent requests would otherwise be aborted by the
// navigation and surface as uncaught errors (the red error indicator). This flag
// lets every apiFetch call quietly hang during the redirect instead of throwing.
let isRedirectingToLogin = false;

const clearStoredSession = () => {
    if (typeof window === 'undefined') return;

    SESSION_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    Object.keys(localStorage)
        .filter((key) => key.startsWith(CACHE_KEY_PREFIX))
        .forEach((key) => localStorage.removeItem(key));
    document.cookie = 'session-token=; Path=/; Max-Age=0; SameSite=Lax';
};

const syncSessionCookie = (token: string | null) => {
    if (typeof document === 'undefined') {
        return;
    }

    if (!token) {
        document.cookie = 'session-token=; Path=/; Max-Age=0; SameSite=Lax';
        return;
    }

    document.cookie = `session-token=${encodeURIComponent(token)}; Path=/; Max-Age=28800; SameSite=Lax`;
};

const parseStoredUser = (storedUser: string | null): User | null => {
    if (!storedUser) return null;

    try {
        return JSON.parse(storedUser) as User;
    } catch {
        return null;
    }
};

const isGlobalProjectsAdmin = (role?: User['role'] | null) =>
    normalizeRole(role) === 'super_admin' || normalizeRole(role) === 'admin';

// Cache Management Utilities
const MAX_CACHE_SIZE = 2 * 1024 * 1024; // 2MB limit
const CACHE_KEY_PREFIX = 'api_cache_';

const getCacheSize = (): number => {
    let totalSize = 0;
    for (let key in localStorage) {
        if (key.startsWith(CACHE_KEY_PREFIX)) {
            totalSize += localStorage.getItem(key)?.length || 0;
        }
    }
    return totalSize;
};

const clearOldestCacheEntry = (): void => {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (let key in localStorage) {
        if (key.startsWith(CACHE_KEY_PREFIX)) {
            try {
                const cached = JSON.parse(localStorage.getItem(key) || '{}');
                const timestamp = new Date(cached.timestamp || 0).getTime();
                if (timestamp < oldestTime) {
                    oldestTime = timestamp;
                    oldestKey = key;
                }
            } catch {
                // Invalid cache entry, remove it
                localStorage.removeItem(key);
            }
        }
    }

    if (oldestKey) {
        localStorage.removeItem(oldestKey);
    }
};

const safeSetCache = (key: string, value: string): void => {
    try {
        localStorage.setItem(key, value);
    } catch (error: any) {
        if (error.name === 'QuotaExceededError') {
            // Clear oldest entries until we have space
            while (getCacheSize() > MAX_CACHE_SIZE * 0.8) {
                clearOldestCacheEntry();
            }
            // Retry
            try {
                localStorage.setItem(key, value);
            } catch {
                // If still failing, clear all cache for this session
                Object.keys(localStorage)
                    .filter(k => k.startsWith(CACHE_KEY_PREFIX))
                    .forEach(k => localStorage.removeItem(k));
            }
        } else {
            throw error;
        }
    }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [currentProject, setCurrentProject] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [outageStatus, setOutageStatus] = useState<'none' | 'stale' | 'expired'>('none');
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const router = useRouter();
    const routerRef = React.useRef(router);
    React.useEffect(() => {
        routerRef.current = router;
    }, [router]);
    const outageStatusRef = React.useRef(outageStatus);
    React.useEffect(() => {
        outageStatusRef.current = outageStatus;
    }, [outageStatus]);

    // In the browser, default to a relative base ('') so requests hit the
    // dashboard's own origin and are proxied to the API (see next.config.mjs
    // rewrites) — this is what lets ngrok / single-origin tunnels work. During
    // SSR there is no origin, so fall back to the local API host.
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? '' : 'http://localhost:4000');

    const clearSessionState = React.useCallback(() => {
        setToken(null);
        setUser(null);
        setCurrentProject(null);
        clearStoredSession();
    }, []);
    const clearSessionStateRef = React.useRef(clearSessionState);
    React.useEffect(() => {
        clearSessionStateRef.current = clearSessionState;
    }, [clearSessionState]);

    useEffect(() => {
        let isMounted = true;

        const initializeSession = async () => {
            const storedToken = localStorage.getItem('session-token');
            const storedUser = parseStoredUser(localStorage.getItem('session-user'));
            const storedProject = localStorage.getItem('current-project');

            console.log('[AuthContext] initializeSession:start', {
                hasStoredToken: Boolean(storedToken),
                storedUserId: storedUser?.id || null,
                storedUserRole: storedUser?.role || null,
                storedAssignedProjects: storedUser?.assignedProjects || [],
                storedProject,
            });

            if (!storedToken || !storedUser) {
                console.warn('[AuthContext] initializeSession:no_stored_session');
                clearStoredSession();
                if (isMounted) setIsLoading(false);
                return;
            }

            try {
                const res = await axios.get(`${API_BASE}/api/v1/user/me`, {
                    headers: {
                        Authorization: `Bearer ${storedToken}`,
                        'session-token': storedToken
                    },
                    timeout: 5000
                });
                const freshUser = res.data?.data?.user || storedUser;

                console.log('[AuthContext] initializeSession:user_me_success', {
                    userId: freshUser?.id || null,
                    role: freshUser?.role || null,
                    assignedProjects: freshUser?.assignedProjects || [],
                    storedProject,
                    hasStoredProjectAccess: storedProject ? (freshUser?.assignedProjects || []).includes(storedProject) : false,
                    isGlobalAdmin: isGlobalProjectsAdmin(freshUser?.role),
                });

                if (!isMounted) return;
                setToken(storedToken);
                setUser(freshUser);
                setCurrentProject(storedProject || null);
                syncSessionCookie(storedToken);
                localStorage.setItem('session-user', JSON.stringify(freshUser));
            } catch (error: any) {
                const status = error.response?.status;
                const code = error.response?.data?.error?.code;

                console.warn('[AuthContext] initializeSession:user_me_failed', {
                    status,
                    code,
                    message: error?.response?.data?.message || error?.message,
                    storedUserId: storedUser?.id || null,
                    storedUserRole: storedUser?.role || null,
                    storedAssignedProjects: storedUser?.assignedProjects || [],
                    storedProject,
                });

                if (status === 401 || code === 'SESSION_EXPIRED') {
                    console.warn('[AuthContext] initializeSession:session_expired');
                    clearStoredSession();
                    if (!isMounted) return;
                    setToken(null);
                    setUser(null);
                    setCurrentProject(null);
                    return;
                }

                if (!isMounted) return;
                console.log('[AuthContext] initializeSession:fallback_to_stored_user', {
                    userId: storedUser?.id || null,
                    role: storedUser?.role || null,
                    assignedProjects: storedUser?.assignedProjects || [],
                    storedProject,
                });
                setToken(storedToken);
                setUser(storedUser);
                setCurrentProject(storedProject || null);
                syncSessionCookie(storedToken);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        initializeSession();

        return () => {
            isMounted = false;
        };
    }, [API_BASE]);

    const logout = React.useCallback(() => {
        clearSessionState();
        router.push('/login');
    }, [clearSessionState, router]);

    const apiFetch = React.useCallback(async (url: string, options: any = {}) => {
        // A session-expiry redirect is already in progress; don't fire more requests
        // or surface errors — just hang until the navigation unmounts this consumer.
        if (isRedirectingToLogin) {
            return new Promise(() => {});
        }

        const connectorBridgeResponse = getConnectorBridgeResponse(url);
        if (connectorBridgeResponse !== undefined) {
            return connectorBridgeResponse;
        }

        let fetchUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
        
        // Auto-Scoping Dashboard Logic:
        // If url starts with /api/v1/dashboard and project context is available, 
        // rewrite to the new RESTful scoped structure.
        if (url.startsWith('/api/v1/dashboard') && user?.tenantId && currentProject) {
            const subPath = url.replace('/api/v1/dashboard', '');
            fetchUrl = `${API_BASE}/api/v1/tenants/${user.tenantId}/projects/${currentProject}${subPath}`;
        }

        const activeToken = token || localStorage.getItem('session-token');
        const activeConnectorId = connectorFilterStore.getActiveConnectorId();
        const cacheKey = `api_cache_${url.replace(/\W/g, '_')}_${activeConnectorId || 'all'}`;

        const headers = {
            ...options.headers,
            'Authorization': activeToken ? `Bearer ${activeToken}` : '',
            'session-token': activeToken || ''
        };
        
        try {
            let requestData = options.body;
            if (requestData && typeof requestData === 'string') {
                try {
                    requestData = JSON.parse(requestData);
                } catch (e) {
                    // fall back to raw string if it's not JSON
                }
            }

            const requestTimeout =
                typeof options.timeout === 'number' && Number.isFinite(options.timeout)
                    ? options.timeout
                    : isLongRunningMutationRequest(url, options.method) || isLargeDashboardListRequest(url)
                        ? LONG_RUNNING_REQUEST_TIMEOUT_MS
                        : DEFAULT_REQUEST_TIMEOUT_MS;

            const requestParams = {
                ...(options.params || {}),
                ...(activeConnectorId ? { connector_instance_id: activeConnectorId } : {}),
            };

            const res = await axios({
                url: fetchUrl,
                method: options.method || 'GET',
                headers,
                data: requestData,
                params: requestParams,
                timeout: requestTimeout
            });

            // Cache Success
            if (options.method === 'GET' || !options.method) {
                const timestamp = new Date().toISOString();
                const cacheValue = JSON.stringify({ data: res.data, timestamp });
                
                // Only cache if payload is reasonable size (< 500KB per entry)
                if (cacheValue.length < 500 * 1024) {
                    safeSetCache(cacheKey, cacheValue);
                }
                
                if (outageStatusRef.current !== 'none') {
                    setOutageStatus('none');
                }
                setLastUpdated(timestamp);
            }

            // Automatic response unwrapping for standardized contracts
            if (res.data && typeof res.data === 'object' && 'success' in res.data) {
                return res.data.data;
            }

            return res.data;
        } catch (error: any) {
            const status = error.response?.status;
            const backendError = error.response?.data?.error;
            const requestTimedOut = error.code === 'ECONNABORTED';
            const backendMessage = backendError?.message
                || error.response?.data?.message
                || error.response?.data?.error
                || (requestTimedOut ? 'Request timed out before the server finished processing.' : error.message);
            const backendCode = backendError?.code || 'FETCH_ERROR';
            const correlationId = backendError?.correlationId;
            const isSessionExpired = status === 401 || backendCode === 'SESSION_EXPIRED';
            const isRateLimited = status === 429 || backendCode === 'RATE_LIMITED';
            const isConflict = status === 409 || backendCode === 'CONFLICT';
            const isLongRunningMutation = isLongRunningMutationRequest(url, options.method);
            const isExpectedSyncDelay = isLongRunningMutation && (requestTimedOut || isRateLimited || !status);
            const suppressUnauthorizedRedirect = options?.suppressUnauthorizedRedirect === true;
            // PageSpeed and other outage-exempt endpoints are slow and routinely return
            // 502/504 (gateway timeout) when the upstream / Google's API is busy. A 504
            // has a real HTTP status (so it isn't ECONNABORTED), which would otherwise fall
            // into the red [API ERROR] branch below. Treat 5xx on these endpoints as an
            // expected, quiet warning — not a frontend error.
            const isSlowFeatureUpstreamTimeout = isOutageExemptRequest(url) && (!status || status >= 500 || requestTimedOut);
            const shouldWarnInsteadOfError = requestTimedOut || isRateLimited || !status || isConflict || isSlowFeatureUpstreamTimeout || (status === 403 && suppressUnauthorizedRedirect);

            // Once a redirect is underway, every other failing request (including ones
            // aborted by the navigation itself) should hang silently rather than throw.
            if (isRedirectingToLogin) {
                return new Promise(() => {});
            }

            if (isSessionExpired) {
                isRedirectingToLogin = true;
                clearSessionStateRef.current();
                if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
                    routerRef.current.replace('/login');
                }

                // Let navigation unmount protected consumers without surfacing an expected stale-session error.
                return new Promise(() => {});
            }

            if (isRateLimited) {
                if (process.env.NODE_ENV !== 'production') {
                    try {
                        console.warn(`[API RATE LIMIT] ${options.method || 'GET'} ${url}`);
                        console.warn(`Code: ${backendCode}`);
                        console.warn(`Message: ${backendMessage || 'Too many requests.'}`);
                        console.groupEnd?.();
                    } catch {
                        // ignore logging failures for throttling responses
                    }
                }

                if ((options.method === 'GET' || !options.method) && typeof window !== 'undefined') {
                    const cached = localStorage.getItem(cacheKey);
                    if (cached) {
                        try {
                            const { data, timestamp } = JSON.parse(cached);
                            console.warn(`[AuthContext] API 429/RATE_LIMITED. Serving cached data from ${timestamp}`);
                            return data;
                        } catch {
                            // ignore cache parse failures and fall through
                        }
                    }
                }
            }

            // Structured logging for development
            if (process.env.NODE_ENV !== 'production') {
                try {
                    let safeErrorMessage = 'Unknown error';
                    try {
                        safeErrorMessage = backendMessage || (error && (error.message || String(error))) || safeErrorMessage;
                    } catch (msgErr) {
                        safeErrorMessage = String(msgErr || 'Unknown error while reading error message');
                    }

                    if (shouldWarnInsteadOfError) {
                        const warningMessage = isConflict
                            ? backendMessage || 'Duplicate resource already exists.'
                            : isExpectedSyncDelay
                                ? `[API WARN] ${options.method || 'GET'} ${url} is still syncing; ${requestTimedOut ? 'timeout' : isRateLimited ? 'rate limited' : 'no response'} received.`
                                : isSlowFeatureUpstreamTimeout
                                    ? `[API WARN] ${options.method || 'GET'} ${url} timed out upstream (${status || 'no response'}); this is expected for slow PageSpeed runs.`
                                    : `[API WARN] ${options.method || 'GET'} ${url} failed with ${requestTimedOut ? 'timeout' : isRateLimited ? 'rate limit' : 'no response'}.`;

                        console.warn(warningMessage);
                    } else {
                        console.group(`[API ERROR] ${options.method || 'GET'} ${url}`);
                        console.error(`Status: ${status || 'Network Error'}`);
                        console.error(`Code: ${backendCode}`);
                        console.error(`Message: ${safeErrorMessage}`);
                        if (correlationId) console.error(`Correlation ID: ${correlationId}`);
                        if (backendError?.details) console.error(`Details:`, backendError.details);
                        console.groupEnd();
                    }
                } catch (logErr) {
                    try {
                        console.error('[API ERROR] Failed to log error details', logErr);
                    } catch {
                        // swallow to avoid breaking consumers
                    }
                }
            }

            // Outage / Connectivity Error Handling
            if (!status || status >= 500 || requestTimedOut) {
                const cached = localStorage.getItem(cacheKey);
                if (cached && (options.method === 'GET' || !options.method)) {
                    const { data, timestamp } = JSON.parse(cached);
                    console.warn(`[AuthContext] API 500/Outage. Serving STALE data from ${timestamp}`);
                    // Only flip the global outage banner for genuine platform failures.
                    // Feature-specific slow endpoints (e.g. PageSpeed) and expected
                    // long-running sync timeouts must not masquerade as a connectivity outage.
                    if (!isOutageExemptRequest(url) && !isExpectedSyncDelay) {
                        setOutageStatus('stale');
                    }
                    return data;
                }
            }

            if (status === 403) {
                console.warn('[AuthContext] apiFetch:403_redirecting_to_unauthorized', {
                    url,
                    fetchUrl,
                    currentProject,
                    userId: user?.id || null,
                    role: user?.role || null,
                    assignedProjects: user?.assignedProjects || [],
                    message: backendMessage,
                    backendCode,
                });
                if (!suppressUnauthorizedRedirect) {
                    routerRef.current.push('/unauthorized');
                }
                throw new Error('Access Denied');
            }

            // Create a structured error for the consumer with richer debug info
            const message = backendMessage || `Request failed with status ${status || 'Unknown'}`;
            const apiError = new Error(`${message} (${options.method || 'GET'} ${url})`);
            (apiError as any).status = status;
            (apiError as any).isApiError = true;
            (apiError as any).code = backendCode;
            if (correlationId) (apiError as any).correlationId = correlationId;
            if (backendError) (apiError as any).backend = backendError;
            throw apiError;
        }
    }, [token, API_BASE, user?.tenantId, currentProject]);

    const setProject = React.useCallback((id: string) => {
        console.log('[AuthContext] setProject', {
            nextProjectId: id,
            previousProjectId: currentProject,
            userId: user?.id || null,
            role: user?.role || null,
            assignedProjects: user?.assignedProjects || [],
        });
        setCurrentProject(id);
        localStorage.setItem('current-project', id);
    }, [currentProject, user]);

    // Shared session-establishment path. Both password login and OTP login feed
    // the same { token, user } shape through here so persistence (localStorage +
    // cookie) and the post-auth redirect are identical regardless of method.
    const establishSession = React.useCallback((newToken: string, newUser: User) => {
        // Fresh session — clear any stale "redirecting to login" guard so requests resume.
        isRedirectingToLogin = false;
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem('session-token', newToken);
        syncSessionCookie(newToken);
        localStorage.setItem('session-user', JSON.stringify(newUser));

        if (newUser.role === 'CUSTOMER' && newUser.assignedProjects.length === 1) {
            console.log('[AuthContext] session:redirect_single_customer_project', {
                projectId: newUser.assignedProjects[0],
                userId: newUser?.id || null,
            });
            setProject(newUser.assignedProjects[0]);
            router.push(`/project/${newUser.assignedProjects[0]}/overview`);
        } else {
            console.log('[AuthContext] session:redirect_projects', {
                userId: newUser?.id || null,
                role: newUser?.role || null,
                assignedProjects: newUser?.assignedProjects || [],
            });
            router.push('/projects');
        }
    }, [router, setProject]);

    const login = React.useCallback(async (email: string, password: string) => {
        try {
            console.log('[AuthContext] login:start', { email });
            const res = await axios.post(`${API_BASE}/api/v1/auth/login`, { email, password });
            const { token: newToken, user: newUser } = res.data.data;

            console.log('[AuthContext] login:success', {
                userId: newUser?.id || null,
                email: newUser?.email || email,
                role: newUser?.role || null,
                assignedProjects: newUser?.assignedProjects || [],
                currentStoredProject: localStorage.getItem('current-project'),
            });

            establishSession(newToken, newUser);
        } catch (error: any) {
            const status = error?.response?.status;
            const message = error?.response?.data?.message || error?.message || 'Invalid credentials';

            if (status === 401) {
                console.warn('[AuthContext] login:invalid_credentials', {
                    email,
                    status,
                    message,
                });
            } else {
                console.error('[AuthContext] login:failed', {
                    email,
                    status,
                    message,
                });
            }

            throw new Error(message);
        }
    }, [API_BASE, establishSession]);

    return (
        <AuthContext.Provider value={{
            user, token, currentProject, login, establishSession, logout, setProject, isLoading, apiFetch,
            outageStatus, lastUpdated
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};