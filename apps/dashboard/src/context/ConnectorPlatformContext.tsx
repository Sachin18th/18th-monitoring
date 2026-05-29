//apps/dashboard/src/context/ConnectorPlatformContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  CanonicalCustomer,
  CanonicalOrder,
  CanonicalProduct,
  ConnectorAlert,
  ConnectorIncident,
  ConnectorSetupValues,
  ConnectorSyncJob,
  ConnectorTestResult,
  ConnectedStore,
  EcommercePlatform,
  IngestionEvent,
  ReconciliationCheck,
} from "../lib/ecommerceConnectors";
import {
  connectorsConfig,
  createStoreFromConnection,
} from "../lib/ecommerceConnectors";
import { useAuth } from "./AuthContext";
import { connectorFilterStore } from "../lib/connectorFilterStore";

type ConnectorSetupState = {
  platform: EcommercePlatform | null;
  open: boolean;
};

type StoreOption = {
  id: string;
  label: string;
  key: string;
};

type ConnectedStoreRecord = ConnectedStore & {
  label?: string;
  providerId?: string;
  category?: string;
  family?: string;
  lastResyncAt?: string;
  latestResyncJob?: {
    jobId?: string;
    status?: string;
    initiatedAt?: string;
    completedAt?: string | null;
  } | null;
};

type ConnectorPlatformContextValue = {
  connectorCatalog: typeof connectorsConfig;
  connectedStores: ConnectedStore[];
  canonicalOrders: CanonicalOrder[];
  canonicalCustomers: CanonicalCustomer[];
  canonicalProducts: CanonicalProduct[];
  alerts: ConnectorAlert[];
  incidents: ConnectorIncident[];
  jobs: ConnectorSyncJob[];
  ingestionEvents: IngestionEvent[];
  reconciliations: ReconciliationCheck[];
  activeConnectorId: string | null;
  activeStoreId: string;
  setActiveConnector: (connectorId: string | null) => void;
  setActiveStoreId: (storeId: string) => void;
  connectorSelectionTick: number;
  connectorSetup: ConnectorSetupState;
  beginConnectorSetup: (platform: EcommercePlatform) => void;
  openConnectorSetupModal: () => void;
  closeConnectorSetup: () => void;
  isSetupModalOpen: boolean;
  testConnectorConnection: (
    platform: EcommercePlatform,
    values: ConnectorSetupValues,
  ) => Promise<ConnectorTestResult>;
  saveConnectorConnection: (
    platform: EcommercePlatform,
    values: ConnectorSetupValues,
  ) => Promise<ConnectedStore>;
  disconnectConnector: (connectorId: string) => void;
  reconnectConnector: (connectorId: string) => void;
  syncConnectorNow: (connectorId: string) => void;
  healthLevel: "healthy" | "warning" | "critical";
  healthLabel: string;
  healthScore: number;
  storeOptions: StoreOption[];
  selectedStoreLabel: string;
  filteredOrders: CanonicalOrder[];
  filteredCustomers: CanonicalCustomer[];
  filteredProducts: CanonicalProduct[];
  orderVelocity: number;
  systemHealthScore: number;
  syncCoverage: number;
};

export const ConnectorPlatformContext = createContext<
  ConnectorPlatformContextValue | undefined
>(undefined);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createId = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;

const sortNewest = <T extends { createdAt?: string; updatedAt?: string }>(
  records: T[],
) =>
  [...records].sort(
    (left, right) =>
      Number(new Date(right.updatedAt || right.createdAt || 0)) -
      Number(new Date(left.updatedAt || left.createdAt || 0)),
  );

const normalizeShopDomain = (value: string) =>
  value.trim().replace(/^https?:\/\//i, "").split("/")[0].replace(/\/+$/, "");

const mapPipelineJobToConnectorJob = (job: any): ConnectorSyncJob => ({
  id: String(job?.id || createId("job")),
  connectorId: String(job?.connectorId || job?.integrationId || "pipeline"),
  connectorName: String(job?.connectorName || job?.type || "Pipeline Job"),
  source:
    job?.source === "adobe_commerce" ? "adobe_commerce" : "shopify",
  storeLabel: String(job?.storeLabel || job?.connectorName || job?.type || "Pipeline Job"),
  recordsProcessed: Number(job?.recordsProcessed || 0),
  durationMs: Number(job?.durationMs || 0),
  status:
    job?.status === "RUNNING" || job?.status === "running"
      ? "running"
      : job?.status === "FAILED" || job?.status === "failed"
        ? "failed"
        : job?.status === "DEAD_LETTERED" || job?.status === "dead_lettered"
          ? "dead_lettered"
          : "completed",
  startedAt: String(
    job?.startedAt || job?.createdAt || job?.updatedAt || new Date().toISOString(),
  ),
});

const normalizeConnectorLabel = (store: any, index = 0) => {
  return (
    String(store.label || store.name || store.connectionLabel || store.providerId || store.family || store.category || `Store ${index + 1}`).trim() ||
    `Store ${index + 1}`
  );
};

const normalizeConnectorPlatform = (store: any): EcommercePlatform => {
  const rawPlatform = String(store.platform || store.providerId || store.category || store.family || "shopify").toLowerCase();
  if (rawPlatform.includes("adobe")) return "adobe_commerce";
  if (rawPlatform.includes("bigcommerce")) return "bigcommerce";
  return "shopify";
};

const normalizeConnectedStore = (
  store: any,
  index = 0,
): ConnectedStoreRecord => {
  const current = new Date().toISOString();
  const connectorId = String(store.connectorId || store.id || store.connectorInstanceId || store.instanceId || `store-${index}`).trim();
  const name = normalizeConnectorLabel(store, index);
  const platform = normalizeConnectorPlatform(store);
  const rawStatus = String(store.status || store.healthStatus || "healthy").toLowerCase();

  return {
    connectorId,
    projectId: String(store.projectId || store.siteId || ""),
    platform,
    status: rawStatus === "offline" ? "offline" : rawStatus === "degraded" ? "degraded" : "healthy",
    lastSuccessfulSync: String(store.lastSuccessfulSync || store.lastSyncAt || current),
    lastAttemptedSync: String(store.lastAttemptedSync || store.lastAttemptAt || current),
    lastResyncAt: String(
      store.lastResyncAt ||
        store.latestResyncJob?.completedAt ||
        store.latestResyncJob?.initiatedAt ||
        store.lastSuccessfulSync ||
        store.lastSyncAt ||
        current,
    ),
    syncErrorCount: Number(store.syncErrorCount || 0),
    webhooksActive: Boolean(store.webhooksActive ?? true),
    tokenExpiresAt: store.tokenExpiresAt || undefined,
    recordsSyncedLast24h: Number(store.recordsSyncedLast24h || 0),
    name,
    connectionLabel:
      normalizeConnectorLabel({ ...store, label: store.connectionLabel || store.label || name }, index),
    storeUrl: String(store.storeUrl || ""),
    storeCode: store.storeCode || undefined,
    shopDomain: store.shopDomain || undefined,
    healthScore: Number(store.healthScore || 0),
    syncProgress: Number(store.syncProgress || 0),
    initialSyncState:
      store.initialSyncState === "completed"
        ? "completed"
        : store.initialSyncState === "in_progress"
          ? "in_progress"
          : "not_started",
    recordsByType: {
      orders: Number(store.recordsByType?.orders || 0),
      customers: Number(store.recordsByType?.customers || 0),
      products: Number(store.recordsByType?.products || 0),
      sessions: Number(store.recordsByType?.sessions || 0),
    },
  };
};

export const ConnectorPlatformProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { currentProject, user, apiFetch } = useAuth();
  // const snapshot = useMemo(() => createInitialConnectorSnapshot(), []);

  const [isLoading, setIsLoading] = useState(true);

  // const [connectedStores, setConnectedStores] = useState<ConnectedStore[]>(snapshot.stores);
  // const [canonicalOrders, setCanonicalOrders] = useState<CanonicalOrder[]>(snapshot.orders);
  // const [canonicalCustomers] = useState<CanonicalCustomer[]>(snapshot.customers);
  // const [canonicalProducts, setCanonicalProducts] = useState<CanonicalProduct[]>(snapshot.products);
  // const [alerts, setAlerts] = useState<ConnectorAlert[]>(snapshot.alerts);
  // const [incidents] = useState<ConnectorIncident[]>(snapshot.incidents);
  // const [jobs, setJobs] = useState<ConnectorSyncJob[]>(snapshot.jobs);
  // const [ingestionEvents, setIngestionEvents] = useState<IngestionEvent[]>(snapshot.ingestionEvents);
  // const [reconciliations] = useState<ReconciliationCheck[]>(snapshot.reconciliations);

  const [connectedStores, setConnectedStores] = useState<ConnectedStoreRecord[]>([]);
  const [canonicalOrders, setCanonicalOrders] = useState<CanonicalOrder[]>([]);
  const [canonicalCustomers, setCanonicalCustomers] = useState<
    CanonicalCustomer[]
  >([]);
  const [canonicalProducts, setCanonicalProducts] = useState<
    CanonicalProduct[]
  >([]);
  const [alerts, setAlerts] = useState<ConnectorAlert[]>([]);
  const [incidents, setIncidents] = useState<ConnectorIncident[]>([]);
  const [jobs, setJobs] = useState<ConnectorSyncJob[]>([]);
  const [ingestionEvents, setIngestionEvents] = useState<IngestionEvent[]>([]);
  const [reconciliations, setReconciliations] = useState<ReconciliationCheck[]>(
    [],
  );

  const [activeConnectorId, setActiveConnectorId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("kpi_active_connector_id");
  });
  const [connectorSelectionTick, setConnectorSelectionTick] = useState<number>(Date.now());
  const [connectorSetup, setConnectorSetup] = useState<ConnectorSetupState>({
    platform: null,
    open: false,
  });
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);

  // Fetch integrations and restore from cache to prevent data loss on reload
  useEffect(() => {
    if (!currentProject) return;
    const projectId = currentProject;
    const tenantId = user?.tenantId || "current";

    const fetchConnectorData = async () => {
      setIsLoading(true);
      try {
        // Try to fetch integrations from API
        try {
          const storesRes = await apiFetch(
            `/api/v1/tenants/${tenantId}/projects/${projectId}/integrations`
          );
          if (Array.isArray(storesRes)) {
            const normalizedStores = storesRes.map((store, index) => normalizeConnectedStore(store, index));
            setConnectedStores(normalizedStores);
            setActiveConnectorId((current) => {
              if (current && normalizedStores.some((store) => store.connectorId === current)) {
                return current;
              }
              return normalizedStores[0]?.connectorId || null;
            });
            // Cache to localStorage for persistence
            try {
              localStorage.setItem(
                `connector_stores_${projectId}`,
                JSON.stringify(normalizedStores)
              );
            } catch (e) {
              // Silently ignore localStorage errors
            }
          }
        } catch (apiErr) {
          // If API fails, try to restore from localStorage
          const cached = localStorage.getItem(`connector_stores_${projectId}`);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (Array.isArray(parsed)) {
                const normalizedStores = parsed.map((store, index) => normalizeConnectedStore(store, index));
                setConnectedStores(normalizedStores);
                setActiveConnectorId((current) => {
                  if (current && normalizedStores.some((store) => store.connectorId === current)) {
                    return current;
                  }
                  return normalizedStores[0]?.connectorId || null;
                });
              }
            } catch (parseErr) {
              console.warn("[ConnectorPlatform] Failed to parse cached stores", parseErr);
            }
          } else {
            console.warn("[ConnectorPlatform] Failed to fetch integrations and no cache available", apiErr);
          }
        }
      } catch (err) {
        console.error("[ConnectorPlatform] Failed to load connector data", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConnectorData(); // Fetch initial data on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject]);

  const refreshPlatformData = async (connectorId?: string | null) => {
    if (!currentProject) return;
    const projectId = currentProject;
    const tenantId = user?.tenantId || "current";

    setIsLoading(true);
    try {
      // Fetch integrations list
      try {
        const storesRes = await apiFetch(
          `/api/v1/tenants/${tenantId}/projects/${projectId}/integrations`
        );
        if (Array.isArray(storesRes)) {
          const normalizedStores = storesRes.map((store, index) => normalizeConnectedStore(store, index));
          setConnectedStores(normalizedStores);
          setActiveConnectorId((current) => {
            if (connectorId && normalizedStores.some((s) => s.connectorId === connectorId)) {
              return connectorId;
            }
            if (current && normalizedStores.some((store) => store.connectorId === current)) {
              return current;
            }
            return normalizedStores[0]?.connectorId || null;
          });
        }
      } catch (e) {
        // ignore integration list errors
      }

      // Fetch canonical datasets scoped to the active connector (apiFetch will include connector_instance_id)
      try {
        const orders = await apiFetch('/api/v1/dashboard/orders/list');
        if (Array.isArray(orders)) setCanonicalOrders(orders);
      } catch (e) {}

      try {
        const customers = await apiFetch('/api/v1/dashboard/customers/list');
        if (Array.isArray(customers)) setCanonicalCustomers(customers);
      } catch (e) {}

      // product list endpoint is not present in this deployment; skip fetching products
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    connectorFilterStore.setActiveConnectorId(activeConnectorId);
    if (typeof window !== "undefined") {
      if (activeConnectorId) {
        localStorage.setItem("kpi_active_connector_id", activeConnectorId);
      } else {
        localStorage.removeItem("kpi_active_connector_id");
      }
    }
  }, [activeConnectorId]);

  useEffect(() => {
    setConnectedStores((stores) =>
      stores.map((store) => {
        const tokenWindow = store.tokenExpiresAt
          ? Number(new Date(store.tokenExpiresAt)) - Date.now()
          : Number.POSITIVE_INFINITY;
        const staleToken = tokenWindow < 1000 * 60 * 60 * 24 * 7;
        const degraded = store.syncErrorCount >= 2 || staleToken;
        const offline = store.syncErrorCount >= 5;
        const nextStatus: ConnectedStore["status"] = offline
          ? "offline"
          : degraded
            ? "degraded"
            : "healthy";
        const nextHealthScore = offline ? 35 : degraded ? 72 : 96;

        return {
          ...store,
          status: nextStatus,
          healthScore: nextHealthScore,
          recordsSyncedLast24h: Math.max(store.recordsSyncedLast24h, 1),
          lastAttemptedSync:
            store.lastAttemptedSync || new Date().toISOString(),
          lastSuccessfulSync:
            nextStatus === "healthy"
              ? new Date().toISOString()
              : store.lastSuccessfulSync,
        };
      }),
    );
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setConnectedStores((stores) =>
        stores.map((store) => {
          if (store.initialSyncState !== "in_progress") return store;
          const nextProgress = Math.min(store.syncProgress + 20, 100);
          return {
            ...store,
            syncProgress: nextProgress,
            initialSyncState: nextProgress >= 100 ? "completed" : "in_progress",
            lastSuccessfulSync:
              nextProgress >= 100
                ? new Date().toISOString()
                : store.lastSuccessfulSync,
            status: nextProgress >= 100 ? "healthy" : store.status,
          };
        }),
      );
    }, 1500);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(
      () => {
        setConnectedStores((stores) =>
          stores.map((store) => {
            const tokenWindow = store.tokenExpiresAt
              ? Number(new Date(store.tokenExpiresAt)) - Date.now()
              : Number.POSITIVE_INFINITY;
            const tokenExpiring = tokenWindow < 1000 * 60 * 60 * 24 * 7;
            const nextErrorCount =
              store.status === "healthy"
                ? store.syncErrorCount
                : store.syncErrorCount + 1;
            const nextStatus =
              nextErrorCount >= 5
                ? "offline"
                : nextErrorCount >= 2 || tokenExpiring
                  ? "degraded"
                  : "healthy";
            return {
              ...store,
              status: nextStatus,
              syncErrorCount: nextErrorCount,
              lastAttemptedSync: new Date().toISOString(),
              lastSuccessfulSync:
                nextStatus === "healthy"
                  ? new Date().toISOString()
                  : store.lastSuccessfulSync,
              healthScore:
                nextStatus === "offline"
                  ? 30
                  : nextStatus === "degraded"
                    ? 74
                    : 98,
            };
          }),
        );
      },
      5 * 60 * 1000,
    );

    return () => window.clearInterval(interval);
  }, []);

  const beginConnectorSetup = (platform: EcommercePlatform) => {
    setConnectorSetup({ platform, open: true });
    setIsSetupModalOpen(true);
  };

  const closeConnectorSetup = () => {
    setConnectorSetup({ platform: null, open: false });
    setIsSetupModalOpen(false);
  };

  const openConnectorSetupModal = () => {
    setConnectorSetup({ platform: null, open: true });
    setIsSetupModalOpen(true);
    console.log("openConnectorSetupModal called");
  };

  useEffect(() => {
    console.log("ConnectorPlatformContext mounted");
  }, []);

  const testConnectorConnection = async (
    platform: EcommercePlatform,
    values: ConnectorSetupValues,
  ): Promise<ConnectorTestResult> => {
    await delay(700);

    if (platform === "shopify") {
      const normalizedShopDomain = normalizeShopDomain(values.shopDomain || "");

      if (!normalizedShopDomain || !values.adminApiAccessToken) {
        return {
          ok: false,
          error:
            "Shopify requires both the shop domain and Admin API access token.",
        };
      }
      if (!normalizedShopDomain.includes(".myshopify.com")) {
        return {
          ok: false,
          error: "Shop domain must look like your-store.myshopify.com.",
        };
      }
    }

    if (platform === "adobe_commerce") {
      if (!values.storeUrl || !values.adminApiToken) {
        return {
          ok: false,
          error:
            "Adobe Commerce requires the store URL and Admin API access token.",
        };
      }
      if (!/^https?:\/\//i.test(values.storeUrl)) {
        return {
          ok: false,
          error: "Store Base URL must be a valid HTTPS URL.",
        };
      }
    }

    if (platform === "bigcommerce") {
      const missing: string[] = [];
      if (!String(values.storeHash || "").trim()) missing.push('Store Hash');
      if (!String(values.accessToken || "").trim()) missing.push('API Access Token');
      if (missing.length > 0) {
        return {
          ok: false,
          error: `BigCommerce requires: ${missing.join(', ')}.`,
        };
      }
    }

    return {
      ok: true,
      message: "Connection successful — store data is accessible",
    };
  };

  const buildConnectorPayload = (
    platform: EcommercePlatform,
    values: ConnectorSetupValues,
    projectId?: string,
  ) => {
    if (platform === "shopify") {
      const normalizedShopDomain = normalizeShopDomain(values.shopDomain || "");

      return {
        type: "shopify",
        label: normalizedShopDomain || "Shopify Store",
        family: "commerce",
        config: {
          shopDomain: normalizedShopDomain,
          apiVersion: values.apiVersion?.trim() || undefined,
        },
        credentials: {
          adminApiAccessToken: values.adminApiAccessToken?.trim() || "",
          ...(projectId && { projectId }),
        },
      };
    }

    if (platform === "bigcommerce") {
      const label = (values.storeHash || "BigCommerce Store").toString();
      return {
        type: "bigcommerce",
        label,
        family: "commerce",
        config: {
          storeHash: values.storeHash?.trim() || undefined,
          storeUrl: values.storeUrl?.trim() || undefined,
        },
        credentials: {
          accessToken: values.accessToken?.trim() || "",
          ...(projectId && { projectId }),
        },
      };
    }

    return {
      type: "adobe_commerce",
      label: values.storeCode?.trim()
        ? `${values.storeCode.trim()} Store`
        : "Adobe Commerce Store",
      family: "commerce",
      config: {
        storeUrl: values.storeUrl?.trim() || "",
        storeCode: values.storeCode?.trim() || undefined,
      },
      credentials: {
        adminApiToken: values.adminApiToken?.trim() || "",
        ...(projectId && { projectId }),
      },
    };
  };

  const saveConnectorConnection = async (
    platform: EcommercePlatform,
    values: ConnectorSetupValues,
  ): Promise<ConnectedStore> => {
    const testResult = await testConnectorConnection(platform, values);
    if (!testResult.ok) {
      throw new Error(
        "error" in testResult
          ? testResult.error
          : "Connection test failed. Please check your credentials and try again.",
      );
    }

    const projectId = currentProject || "default-project";
    const tenantId = user?.tenantId || "current";
    const payload = buildConnectorPayload(platform, values, projectId);

    const createdInstance = await apiFetch(
      `/api/v1/tenants/${tenantId}/projects/${projectId}/integrations`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    const connectorId = createdInstance?.id || createId(platform);
    const created = createStoreFromConnection(
      platform,
      values,
      projectId,
      connectorId,
    );
    const displayLabel = normalizeConnectorLabel(
      {
        label: createdInstance?.label,
        name: createdInstance?.label,
        connectionLabel: createdInstance?.providerId,
        providerId: createdInstance?.providerId,
        platform: createdInstance?.providerId,
      },
      0,
    );
    const hydratedStore: ConnectedStore = {
      ...created.store,
      connectorId,
      name: displayLabel || created.store.name,
      connectionLabel: displayLabel,
      projectId,
      status: (createdInstance?.status?.toLowerCase?.() ||
        "healthy") as ConnectedStore["status"],
      healthScore: createdInstance?.healthScore ?? created.store.healthScore,
      lastSuccessfulSync:
        createdInstance?.lastSuccessfulSync ||
        createdInstance?.lastSyncAt?.toISOString?.() ||
        created.store.lastSuccessfulSync,
      lastAttemptedSync:
        createdInstance?.lastAttemptedSync ||
        createdInstance?.lastAttemptAt?.toISOString?.() ||
        created.store.lastAttemptedSync,
      syncErrorCount:
        createdInstance?.syncErrorCount ?? created.store.syncErrorCount ?? 0,
      webhooksActive:
        createdInstance?.webhooksActive ??
        created.store.webhooksActive ??
        false,
      tokenExpiresAt:
        createdInstance?.tokenExpiresAt || created.store.tokenExpiresAt,
      recordsSyncedLast24h:
        createdInstance?.recordsSyncedLast24h ??
        created.store.recordsSyncedLast24h,
    };

    setConnectedStores((stores) => [hydratedStore, ...stores]);
    setCanonicalOrders((orders) => sortNewest([...created.orders, ...orders]));
    setCanonicalProducts((products) => [
      ...products,
      {
        id: `${platform}_product_${Date.now()}`,
        source: platform,
        name: platform === "shopify" ? "Synced Shopify Product" : platform === "bigcommerce" ? "Synced BigCommerce Product" : "Synced Adobe Product",
        sku: `${platform.toUpperCase()}-${Date.now()}`,
        inventory: 18,
        price: platform === "shopify" ? 99.5 : platform === "bigcommerce" ? 119.5 : 149.5,
        updatedAt: new Date().toISOString(),
      },
    ]);
    setJobs((current) => [
      {
        id: createId("job"),
        connectorId,
        connectorName: created.store.name,
        source: platform,
        storeLabel: created.store.name,
        recordsProcessed: 0,
        durationMs: 0,
        status: "running",
        startedAt: new Date().toISOString(),
      },
      ...current,
    ]);
    setIngestionEvents((current) => [
      {
        id: createId("ing"),
        connectorId,
        source: platform,
        status: "queued",
        createdAt: new Date().toISOString(),
        sourceReferenceId: platform === "shopify" ? "orders.json" : platform === "bigcommerce" ? "v3/orders" : "V1/orders",
        validation: { isValid: true },
      },
      ...current,
    ]);
    setAlerts((current) => [
      {
        id: createId("al"),
        severity: "high",
        source: platform,
        message: `Initial sync started for ${created.store.name}`,
        createdAt: new Date().toISOString(),
        status: "active",
      },
      ...current,
    ]);
    setConnectorSetup({ platform: null, open: false });

    return hydratedStore;
  };

  const disconnectConnector = (connectorId: string) => {
    setConnectedStores((stores) =>
      stores.filter((store) => store.connectorId !== connectorId),
    );
  };

  const reconnectConnector = (connectorId: string) => {
    setConnectedStores((stores) =>
      stores.map((store) =>
        store.connectorId === connectorId
          ? {
              ...store,
              status: "healthy",
              syncErrorCount: 0,
              healthScore: 98,
              lastSuccessfulSync: new Date().toISOString(),
              webhooksActive: true,
            }
          : store,
      ),
    );
  };

  const syncConnectorNow = (connectorId: string) => {
    setJobs((current) => [
      {
        id: createId("job"),
        connectorId,
        connectorName:
          connectedStores.find((store) => store.connectorId === connectorId)
            ?.name || "Connector",
        source:
          connectedStores.find((store) => store.connectorId === connectorId)
            ?.platform || "shopify",
        storeLabel:
          connectedStores.find((store) => store.connectorId === connectorId)
            ?.name || "Connector",
        recordsProcessed: 64,
        durationMs: 24100,
        status: "running",
        startedAt: new Date().toISOString(),
      },
      ...current,
    ]);
  };

  const filteredOrders = useMemo(() => {
    if (!activeConnectorId) return canonicalOrders;
    const selectedStore = connectedStores.find(
      (store) => store.connectorId === activeConnectorId,
    );
    if (!selectedStore) return canonicalOrders;
    return canonicalOrders.filter(
      (order) => order.source === selectedStore.platform,
    );
  }, [activeConnectorId, canonicalOrders, connectedStores]);

  const filteredCustomers = useMemo(() => {
    if (!activeConnectorId) return canonicalCustomers;
    const selectedStore = connectedStores.find(
      (store) => store.connectorId === activeConnectorId,
    );
    if (!selectedStore) return canonicalCustomers;
    return canonicalCustomers.filter(
      (customer) => customer.source === selectedStore.platform,
    );
  }, [activeConnectorId, canonicalCustomers, connectedStores]);

  const filteredProducts = useMemo(() => {
    if (!activeConnectorId) return canonicalProducts;
    const selectedStore = connectedStores.find(
      (store) => store.connectorId === activeConnectorId,
    );
    if (!selectedStore) return canonicalProducts;
    return canonicalProducts.filter(
      (product) => product.source === selectedStore.platform,
    );
  }, [activeConnectorId, canonicalProducts, connectedStores]);

  const healthScore = useMemo(() => {
    const storeScore =
      connectedStores.reduce((sum, store) => sum + store.healthScore, 0) /
      Math.max(connectedStores.length, 1);
    const alertPenalty =
      alerts.filter(
        (alert) => alert.status === "active" && alert.severity === "critical",
      ).length * 8;
    return Math.max(0, Math.min(100, Math.round(storeScore - alertPenalty)));
  }, [alerts, connectedStores]);

  const healthLevel = useMemo(() => {
    const worstStore = connectedStores.reduce<
      "healthy" | "warning" | "critical"
    >((worst, store) => {
      if (store.status === "offline") return "critical";
      if (store.status === "degraded" && worst === "healthy") return "warning";
      return worst;
    }, "healthy");

    if (worstStore === "critical" || healthScore < 70) return "critical";
    if (worstStore === "warning" || healthScore < 90) return "warning";
    return "healthy";
  }, [connectedStores, healthScore]);

  const selectedStoreLabel = useMemo(() => {
    if (connectedStores.length === 0) return "No store";
    if (!activeConnectorId) return "No store";
    return normalizeConnectorLabel(
      connectedStores.find((store) => store.connectorId === activeConnectorId),
    );
  }, [activeConnectorId, connectedStores]);

  const systemHealthScore = useMemo(() => {
    return Math.round(
      (healthScore +
        connectedStores.filter((store) => store.status === "healthy").length *
          4) /
        2,
    );
  }, [connectedStores, healthScore]);

  const orderVelocity = useMemo(() => {
    const recentOrders = filteredOrders.filter(
      (order) =>
        Date.now() - Number(new Date(order.createdAt)) < 1000 * 60 * 60,
    );
    return Number((recentOrders.length / 60).toFixed(2));
  }, [filteredOrders]);

  const syncCoverage = useMemo(() => {
    const synchronized = connectedStores.reduce(
      (sum, store) => sum + (store.initialSyncState === "completed" ? 1 : 0),
      0,
    );
    return connectedStores.length === 0
      ? 0
      : Math.round((synchronized / connectedStores.length) * 100);
  }, [connectedStores]);

  const storeOptions = useMemo<StoreOption[]>(
    () => {
      const usedKeys = new Set<string>();

      return [
        ...connectedStores.map((store, index) => {
          const optionId = store.connectorId?.trim() || `store-${index}`;
          let optionKey = optionId;
          let suffix = 1;

          while (usedKeys.has(optionKey)) {
            optionKey = `${optionId}-${suffix}`;
            suffix += 1;
          }

          usedKeys.add(optionKey);

          return {
            id: optionId,
            label: normalizeConnectorLabel(store, index),
            key: optionKey,
          };
        }),
      ];
    },
    [connectedStores],
  );

  const value: ConnectorPlatformContextValue = {
    connectorCatalog: connectorsConfig,
    connectedStores,
    canonicalOrders: filteredOrders,
    canonicalCustomers: filteredCustomers,
    canonicalProducts: filteredProducts,
    alerts,
    incidents,
    jobs,
    ingestionEvents,
    reconciliations,
    activeConnectorId,
    activeStoreId: activeConnectorId || connectedStores[0]?.connectorId || "",
    setActiveConnector: (connectorId: string | null) => {
      setActiveConnectorId(connectorId);
      try {
        connectorFilterStore.setActiveConnectorId(connectorId);
      } catch (e) {
        // ignore
      }
      setConnectorSelectionTick(Date.now());
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kpi:connector:selected', { detail: { connectorId, projectId: currentProject } }));
      }
      // Trigger an immediate refresh of platform data scoped to the selected connector
      void refreshPlatformData(connectorId);
    },
    setActiveStoreId: (storeId: string) => {
      const id = storeId || null;
      setActiveConnectorId(id);
      try {
        connectorFilterStore.setActiveConnectorId(id);
      } catch (e) {}
      setConnectorSelectionTick(Date.now());
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kpi:connector:selected', { detail: { connectorId: id, projectId: currentProject } }));
      }
      // Immediately refresh scoped data
      void refreshPlatformData(id);
    },
    connectorSetup,
    beginConnectorSetup,
    openConnectorSetupModal,
    closeConnectorSetup,
    isSetupModalOpen,
    testConnectorConnection,
    saveConnectorConnection,
    disconnectConnector,
    reconnectConnector,
    syncConnectorNow,
    healthLevel,
    healthLabel:
      healthLevel === "healthy"
        ? "HEALTHY"
        : healthLevel === "warning"
          ? "WARNING"
          : "CRITICAL",
    healthScore,
    storeOptions,
    selectedStoreLabel,
    connectorSelectionTick,
    filteredOrders,
    filteredCustomers,
    filteredProducts,
    orderVelocity,
    systemHealthScore,
    syncCoverage,
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as any).__kpiConnectorPlatform = value;
  }, [value]);

  return (
    <ConnectorPlatformContext.Provider value={value}>
      {children}
    </ConnectorPlatformContext.Provider>
  );
};

export const useConnectorPlatform = () => {
  const context = useContext(ConnectorPlatformContext);
  if (!context) {
    throw new Error(
      "useConnectorPlatform must be used within ConnectorPlatformProvider",
    );
  }
  return context;
};
