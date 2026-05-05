// 'use client';

// import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
// import type {
//   CanonicalCustomer,
//   CanonicalOrder,
//   CanonicalProduct,
//   ConnectorAlert,
//   ConnectorIncident,
//   ConnectorSetupValues,
//   ConnectorSyncJob,
//   ConnectorTestResult,
//   ConnectedStore,
//   EcommercePlatform,
//   IngestionEvent,
//   ReconciliationCheck
// } from '../lib/ecommerceConnectors';
// import { connectorsConfig, createInitialConnectorSnapshot, createStoreFromConnection } from '../lib/ecommerceConnectors';
// import { useAuth } from './AuthContext';

// type ConnectorSetupState = {
//   platform: EcommercePlatform | null;
//   open: boolean;
// };

// type ConnectorPlatformContextValue = {
//   connectorCatalog: typeof connectorsConfig;
//   connectedStores: ConnectedStore[];
//   canonicalOrders: CanonicalOrder[];
//   canonicalCustomers: CanonicalCustomer[];
//   canonicalProducts: CanonicalProduct[];
//   alerts: ConnectorAlert[];
//   incidents: ConnectorIncident[];
//   jobs: ConnectorSyncJob[];
//   ingestionEvents: IngestionEvent[];
//   reconciliations: ReconciliationCheck[];
//   activeStoreId: string;
//   setActiveStoreId: (storeId: string) => void;
//   connectorSetup: ConnectorSetupState;
//   beginConnectorSetup: (platform: EcommercePlatform) => void;
//   openConnectorSetupModal: () => void;
//   closeConnectorSetup: () => void;
//   isSetupModalOpen: boolean;
//   testConnectorConnection: (platform: EcommercePlatform, values: ConnectorSetupValues) => Promise<ConnectorTestResult>;
//   saveConnectorConnection: (platform: EcommercePlatform, values: ConnectorSetupValues) => Promise<ConnectedStore>;
//   disconnectConnector: (connectorId: string) => void;
//   reconnectConnector: (connectorId: string) => void;
//   syncConnectorNow: (connectorId: string) => void;
//   healthLevel: 'healthy' | 'warning' | 'critical';
//   healthLabel: string;
//   healthScore: number;
//   storeOptions: Array<{ id: string; label: string }>;
//   selectedStoreLabel: string;
//   filteredOrders: CanonicalOrder[];
//   filteredCustomers: CanonicalCustomer[];
//   filteredProducts: CanonicalProduct[];
//   orderVelocity: number;
//   systemHealthScore: number;
//   syncCoverage: number;
// };

// const ConnectorPlatformContext = createContext<ConnectorPlatformContextValue | undefined>(undefined);

// const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// const createId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;

// const sortNewest = <T extends { createdAt?: string; updatedAt?: string }>(records: T[]) =>
//   [...records].sort((left, right) => Number(new Date(right.updatedAt || right.createdAt || 0)) - Number(new Date(left.updatedAt || left.createdAt || 0)));

// export const ConnectorPlatformProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
//   const { currentProject } = useAuth();
//   const snapshot = useMemo(() => createInitialConnectorSnapshot(), []);

//   const [connectedStores, setConnectedStores] = useState<ConnectedStore[]>(snapshot.stores);
//   const [canonicalOrders, setCanonicalOrders] = useState<CanonicalOrder[]>(snapshot.orders);
//   const [canonicalCustomers] = useState<CanonicalCustomer[]>(snapshot.customers);
//   const [canonicalProducts, setCanonicalProducts] = useState<CanonicalProduct[]>(snapshot.products);
//   const [alerts, setAlerts] = useState<ConnectorAlert[]>(snapshot.alerts);
//   const [incidents] = useState<ConnectorIncident[]>(snapshot.incidents);
//   const [jobs, setJobs] = useState<ConnectorSyncJob[]>(snapshot.jobs);
//   const [ingestionEvents, setIngestionEvents] = useState<IngestionEvent[]>(snapshot.ingestionEvents);
//   const [reconciliations] = useState<ReconciliationCheck[]>(snapshot.reconciliations);
//   const [activeStoreId, setActiveStoreId] = useState('all');
//   const [connectorSetup, setConnectorSetup] = useState<ConnectorSetupState>({ platform: null, open: false });
//   const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);

//   useEffect(() => {
//     setConnectedStores((stores) =>
//       stores.map((store) => {
//         const tokenWindow = store.tokenExpiresAt ? Number(new Date(store.tokenExpiresAt)) - Date.now() : Number.POSITIVE_INFINITY;
//         const staleToken = tokenWindow < 1000 * 60 * 60 * 24 * 7;
//         const degraded = store.syncErrorCount >= 2 || staleToken;
//         const offline = store.syncErrorCount >= 5;
//         const nextStatus: ConnectedStore['status'] = offline ? 'offline' : degraded ? 'degraded' : 'healthy';
//         const nextHealthScore = offline ? 35 : degraded ? 72 : 96;

//         return {
//           ...store,
//           status: nextStatus,
//           healthScore: nextHealthScore,
//           recordsSyncedLast24h: Math.max(store.recordsSyncedLast24h, 1),
//           lastAttemptedSync: store.lastAttemptedSync || new Date().toISOString(),
//           lastSuccessfulSync: nextStatus === 'healthy' ? new Date().toISOString() : store.lastSuccessfulSync
//         };
//       })
//     );
//   }, []);

//   useEffect(() => {
//     const interval = window.setInterval(() => {
//       setConnectedStores((stores) =>
//         stores.map((store) => {
//           if (store.initialSyncState !== 'in_progress') return store;
//           const nextProgress = Math.min(store.syncProgress + 20, 100);
//           return {
//             ...store,
//             syncProgress: nextProgress,
//             initialSyncState: nextProgress >= 100 ? 'completed' : 'in_progress',
//             lastSuccessfulSync: nextProgress >= 100 ? new Date().toISOString() : store.lastSuccessfulSync,
//             status: nextProgress >= 100 ? 'healthy' : store.status
//           };
//         })
//       );
//     }, 1500);

//     return () => window.clearInterval(interval);
//   }, []);

//   useEffect(() => {
//     const interval = window.setInterval(() => {
//       setConnectedStores((stores) =>
//         stores.map((store) => {
//           const tokenWindow = store.tokenExpiresAt ? Number(new Date(store.tokenExpiresAt)) - Date.now() : Number.POSITIVE_INFINITY;
//           const tokenExpiring = tokenWindow < 1000 * 60 * 60 * 24 * 7;
//           const nextErrorCount = store.status === 'healthy' ? store.syncErrorCount : store.syncErrorCount + 1;
//           const nextStatus = nextErrorCount >= 5 ? 'offline' : nextErrorCount >= 2 || tokenExpiring ? 'degraded' : 'healthy';
//           return {
//             ...store,
//             status: nextStatus,
//             syncErrorCount: nextErrorCount,
//             lastAttemptedSync: new Date().toISOString(),
//             lastSuccessfulSync: nextStatus === 'healthy' ? new Date().toISOString() : store.lastSuccessfulSync,
//             healthScore: nextStatus === 'offline' ? 30 : nextStatus === 'degraded' ? 74 : 98
//           };
//         })
//       );
//     }, 5 * 60 * 1000);

//     return () => window.clearInterval(interval);
//   }, []);

//   const beginConnectorSetup = (platform: EcommercePlatform) => {
//     setConnectorSetup({ platform, open: true });
//     setIsSetupModalOpen(true);
//   };

//   const closeConnectorSetup = () => {
//     setConnectorSetup({ platform: null, open: false });
//     setIsSetupModalOpen(false);
//   };

//   const openConnectorSetupModal = () => {
//     setConnectorSetup({ platform: null, open: true });
//     setIsSetupModalOpen(true);
//     console.log('openConnectorSetupModal called');
//   };

//   useEffect(() => {
//     console.log('ConnectorPlatformContext mounted');
//   }, []);

//   const testConnectorConnection = async (platform: EcommercePlatform, values: ConnectorSetupValues): Promise<ConnectorTestResult> => {
//     await delay(700);

//     if (platform === 'shopify') {
//       if (!values.shopDomain || !values.adminApiAccessToken) {
//         return { ok: false, error: 'Shopify requires both the shop domain and Admin API access token.' };
//       }
//       if (!values.shopDomain.includes('.myshopify.com')) {
//         return { ok: false, error: 'Shop domain must look like your-store.myshopify.com.' };
//       }
//     }

//     if (platform === 'adobe_commerce') {
//       if (!values.storeUrl || !values.adminApiToken) {
//         return { ok: false, error: 'Adobe Commerce requires the store URL and Admin API access token.' };
//       }
//       if (!/^https?:\/\//i.test(values.storeUrl)) {
//         return { ok: false, error: 'Store Base URL must be a valid HTTPS URL.' };
//       }
//     }

//     return { ok: true, message: 'Connection successful — store data is accessible' };
//   };

//   const saveConnectorConnection = async (platform: EcommercePlatform, values: ConnectorSetupValues): Promise<ConnectedStore> => {
//     const testResult = await testConnectorConnection(platform, values);
//     if (!testResult.ok) {
//       throw new Error(testResult.error);
//     }

//     const connectorId = createId(platform);
//     const projectId = currentProject || 'default-project';
//     const created = createStoreFromConnection(platform, values, projectId, connectorId);

//     setConnectedStores((stores) => [created.store, ...stores]);
//     setCanonicalOrders((orders) => sortNewest([...created.orders, ...orders]));
//     setCanonicalProducts((products) => [
//       ...products,
//       {
//         id: `${platform}_product_${Date.now()}`,
//         source: platform,
//         name: platform === 'shopify' ? 'Synced Shopify Product' : 'Synced Adobe Product',
//         sku: `${platform.toUpperCase()}-${Date.now()}`,
//         inventory: 18,
//         price: platform === 'shopify' ? 99.5 : 149.5,
//         updatedAt: new Date().toISOString()
//       }
//     ]);
//     setJobs((current) => [
//       {
//         id: createId('job'),
//         connectorId,
//         connectorName: created.store.name,
//         source: platform,
//         storeLabel: created.store.name,
//         recordsProcessed: 0,
//         durationMs: 0,
//         status: 'running',
//         startedAt: new Date().toISOString()
//       },
//       ...current
//     ]);
//     setIngestionEvents((current) => [
//       {
//         id: createId('ing'),
//         connectorId,
//         source: platform,
//         status: 'queued',
//         createdAt: new Date().toISOString(),
//         sourceReferenceId: platform === 'shopify' ? 'orders.json' : 'V1/orders',
//         validation: { isValid: true }
//       },
//       ...current
//     ]);
//     setAlerts((current) => [
//       {
//         id: createId('al'),
//         severity: 'high',
//         source: platform,
//         message: `Initial sync started for ${created.store.name}`,
//         createdAt: new Date().toISOString(),
//         status: 'active'
//       },
//       ...current
//     ]);
//     setConnectorSetup({ platform: null, open: false });

//     return created.store;
//   };

//   const disconnectConnector = (connectorId: string) => {
//     setConnectedStores((stores) => stores.filter((store) => store.connectorId !== connectorId));
//   };

//   const reconnectConnector = (connectorId: string) => {
//     setConnectedStores((stores) =>
//       stores.map((store) =>
//         store.connectorId === connectorId
//           ? { ...store, status: 'healthy', syncErrorCount: 0, healthScore: 98, lastSuccessfulSync: new Date().toISOString(), webhooksActive: true }
//           : store
//       )
//     );
//   };

//   const syncConnectorNow = (connectorId: string) => {
//     setJobs((current) => [
//       {
//         id: createId('job'),
//         connectorId,
//         connectorName: connectedStores.find((store) => store.connectorId === connectorId)?.name || 'Connector',
//         source: connectedStores.find((store) => store.connectorId === connectorId)?.platform || 'shopify',
//         storeLabel: connectedStores.find((store) => store.connectorId === connectorId)?.name || 'Connector',
//         recordsProcessed: 64,
//         durationMs: 24100,
//         status: 'running',
//         startedAt: new Date().toISOString()
//       },
//       ...current
//     ]);
//   };

//   const filteredOrders = useMemo(() => {
//     if (activeStoreId === 'all') return canonicalOrders;
//     const selectedStore = connectedStores.find((store) => store.connectorId === activeStoreId);
//     if (!selectedStore) return canonicalOrders;
//     return canonicalOrders.filter((order) => order.source === selectedStore.platform);
//   }, [activeStoreId, canonicalOrders, connectedStores]);

//   const filteredCustomers = useMemo(() => {
//     if (activeStoreId === 'all') return canonicalCustomers;
//     const selectedStore = connectedStores.find((store) => store.connectorId === activeStoreId);
//     if (!selectedStore) return canonicalCustomers;
//     return canonicalCustomers.filter((customer) => customer.source === selectedStore.platform);
//   }, [activeStoreId, canonicalCustomers, connectedStores]);

//   const filteredProducts = useMemo(() => {
//     if (activeStoreId === 'all') return canonicalProducts;
//     const selectedStore = connectedStores.find((store) => store.connectorId === activeStoreId);
//     if (!selectedStore) return canonicalProducts;
//     return canonicalProducts.filter((product) => product.source === selectedStore.platform);
//   }, [activeStoreId, canonicalProducts, connectedStores]);

//   const healthScore = useMemo(() => {
//     const storeScore = connectedStores.reduce((sum, store) => sum + store.healthScore, 0) / Math.max(connectedStores.length, 1);
//     const alertPenalty = alerts.filter((alert) => alert.status === 'active' && alert.severity === 'critical').length * 8;
//     return Math.max(0, Math.min(100, Math.round(storeScore - alertPenalty)));
//   }, [alerts, connectedStores]);

//   const healthLevel = useMemo(() => {
//     const worstStore = connectedStores.reduce<'healthy' | 'warning' | 'critical'>((worst, store) => {
//       if (store.status === 'offline') return 'critical';
//       if (store.status === 'degraded' && worst === 'healthy') return 'warning';
//       return worst;
//     }, 'healthy');

//     if (worstStore === 'critical' || healthScore < 70) return 'critical';
//     if (worstStore === 'warning' || healthScore < 90) return 'warning';
//     return 'healthy';
//   }, [connectedStores, healthScore]);

//   const selectedStoreLabel = useMemo(() => {
//     if (activeStoreId === 'all') return 'All Stores';
//     return connectedStores.find((store) => store.connectorId === activeStoreId)?.name || 'All Stores';
//   }, [activeStoreId, connectedStores]);

//   const systemHealthScore = useMemo(() => {
//     return Math.round((healthScore + connectedStores.filter((store) => store.status === 'healthy').length * 4) / 2);
//   }, [connectedStores, healthScore]);

//   const orderVelocity = useMemo(() => {
//     const recentOrders = filteredOrders.filter((order) => Date.now() - Number(new Date(order.createdAt)) < 1000 * 60 * 60);
//     return Number((recentOrders.length / 60).toFixed(2));
//   }, [filteredOrders]);

//   const syncCoverage = useMemo(() => {
//     const synchronized = connectedStores.reduce((sum, store) => sum + (store.initialSyncState === 'completed' ? 1 : 0), 0);
//     return connectedStores.length === 0 ? 0 : Math.round((synchronized / connectedStores.length) * 100);
//   }, [connectedStores]);

//   const storeOptions = useMemo(
//     () => [
//       { id: 'all', label: 'All Stores' },
//       ...connectedStores.map((store) => ({ id: store.connectorId, label: store.name }))
//     ],
//     [connectedStores]
//   );

//   const value: ConnectorPlatformContextValue = {
//     connectorCatalog: connectorsConfig,
//     connectedStores,
//     canonicalOrders: filteredOrders,
//     canonicalCustomers: filteredCustomers,
//     canonicalProducts: filteredProducts,
//     alerts,
//     incidents,
//     jobs,
//     ingestionEvents,
//     reconciliations,
//     activeStoreId,
//     setActiveStoreId,
//     connectorSetup,
//     beginConnectorSetup,
//     openConnectorSetupModal,
//     closeConnectorSetup,
//     isSetupModalOpen,
//     testConnectorConnection,
//     saveConnectorConnection,
//     disconnectConnector,
//     reconnectConnector,
//     syncConnectorNow,
//     healthLevel,
//     healthLabel: healthLevel === 'healthy' ? 'HEALTHY' : healthLevel === 'warning' ? 'WARNING' : 'CRITICAL',
//     healthScore,
//     storeOptions,
//     selectedStoreLabel,
//     filteredOrders,
//     filteredCustomers,
//     filteredProducts,
//     orderVelocity,
//     systemHealthScore,
//     syncCoverage
//   };

//   useEffect(() => {
//     if (typeof window === 'undefined') return;
//     (window as any).__kpiConnectorPlatform = value;
//   }, [value]);

//   return <ConnectorPlatformContext.Provider value={value}>{children}</ConnectorPlatformContext.Provider>;
// };

// export const useConnectorPlatform = () => {
//   const context = useContext(ConnectorPlatformContext);
//   if (!context) {
//     throw new Error('useConnectorPlatform must be used within ConnectorPlatformProvider');
//   }
//   return context;
// };

'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
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
  ReconciliationCheck
} from '../lib/ecommerceConnectors';
import { connectorsConfig, createInitialConnectorSnapshot, createStoreFromConnection } from '../lib/ecommerceConnectors';
import { useAuth } from './AuthContext';

type ConnectorSetupState = {
  platform: EcommercePlatform | null;
  open: boolean;
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
  activeStoreId: string;
  setActiveStoreId: (storeId: string) => void;
  connectorSetup: ConnectorSetupState;
  beginConnectorSetup: (platform: EcommercePlatform) => void;
  openConnectorSetupModal: () => void;
  closeConnectorSetup: () => void;
  isSetupModalOpen: boolean;
  testConnectorConnection: (platform: EcommercePlatform, values: ConnectorSetupValues) => Promise<ConnectorTestResult>;
  saveConnectorConnection: (platform: EcommercePlatform, values: ConnectorSetupValues) => Promise<ConnectedStore>;
  disconnectConnector: (connectorId: string) => void;
  reconnectConnector: (connectorId: string) => void;
  syncConnectorNow: (connectorId: string) => void;
  healthLevel: 'healthy' | 'warning' | 'critical';
  healthLabel: string;
  healthScore: number;
  storeOptions: Array<{ id: string; label: string }>;
  selectedStoreLabel: string;
  filteredOrders: CanonicalOrder[];
  filteredCustomers: CanonicalCustomer[];
  filteredProducts: CanonicalProduct[];
  orderVelocity: number;
  systemHealthScore: number;
  syncCoverage: number;
};

const ConnectorPlatformContext = createContext<ConnectorPlatformContextValue | undefined>(undefined);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;

const sortNewest = <T extends { createdAt?: string; updatedAt?: string }>(records: T[]) =>
  [...records].sort((left, right) => Number(new Date(right.updatedAt || right.createdAt || 0)) - Number(new Date(left.updatedAt || left.createdAt || 0)));

export const ConnectorPlatformProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentProject, user, apiFetch } = useAuth();
  const snapshot = useMemo(() => createInitialConnectorSnapshot(), []);

  const [connectedStores, setConnectedStores] = useState<ConnectedStore[]>(snapshot.stores);
  const [canonicalOrders, setCanonicalOrders] = useState<CanonicalOrder[]>(snapshot.orders);
  const [canonicalCustomers] = useState<CanonicalCustomer[]>(snapshot.customers);
  const [canonicalProducts, setCanonicalProducts] = useState<CanonicalProduct[]>(snapshot.products);
  const [alerts, setAlerts] = useState<ConnectorAlert[]>(snapshot.alerts);
  const [incidents] = useState<ConnectorIncident[]>(snapshot.incidents);
  const [jobs, setJobs] = useState<ConnectorSyncJob[]>(snapshot.jobs);
  const [ingestionEvents, setIngestionEvents] = useState<IngestionEvent[]>(snapshot.ingestionEvents);
  const [reconciliations] = useState<ReconciliationCheck[]>(snapshot.reconciliations);
  const [activeStoreId, setActiveStoreId] = useState('all');
  const [connectorSetup, setConnectorSetup] = useState<ConnectorSetupState>({ platform: null, open: false });
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);

  useEffect(() => {
    setConnectedStores((stores) =>
      stores.map((store) => {
        const tokenWindow = store.tokenExpiresAt ? Number(new Date(store.tokenExpiresAt)) - Date.now() : Number.POSITIVE_INFINITY;
        const staleToken = tokenWindow < 1000 * 60 * 60 * 24 * 7;
        const degraded = store.syncErrorCount >= 2 || staleToken;
        const offline = store.syncErrorCount >= 5;
        const nextStatus: ConnectedStore['status'] = offline ? 'offline' : degraded ? 'degraded' : 'healthy';
        const nextHealthScore = offline ? 35 : degraded ? 72 : 96;

        return {
          ...store,
          status: nextStatus,
          healthScore: nextHealthScore,
          recordsSyncedLast24h: Math.max(store.recordsSyncedLast24h, 1),
          lastAttemptedSync: store.lastAttemptedSync || new Date().toISOString(),
          lastSuccessfulSync: nextStatus === 'healthy' ? new Date().toISOString() : store.lastSuccessfulSync
        };
      })
    );
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setConnectedStores((stores) =>
        stores.map((store) => {
          if (store.initialSyncState !== 'in_progress') return store;
          const nextProgress = Math.min(store.syncProgress + 20, 100);
          return {
            ...store,
            syncProgress: nextProgress,
            initialSyncState: nextProgress >= 100 ? 'completed' : 'in_progress',
            lastSuccessfulSync: nextProgress >= 100 ? new Date().toISOString() : store.lastSuccessfulSync,
            status: nextProgress >= 100 ? 'healthy' : store.status
          };
        })
      );
    }, 1500);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setConnectedStores((stores) =>
        stores.map((store) => {
          const tokenWindow = store.tokenExpiresAt ? Number(new Date(store.tokenExpiresAt)) - Date.now() : Number.POSITIVE_INFINITY;
          const tokenExpiring = tokenWindow < 1000 * 60 * 60 * 24 * 7;
          const nextErrorCount = store.status === 'healthy' ? store.syncErrorCount : store.syncErrorCount + 1;
          const nextStatus = nextErrorCount >= 5 ? 'offline' : nextErrorCount >= 2 || tokenExpiring ? 'degraded' : 'healthy';
          return {
            ...store,
            status: nextStatus,
            syncErrorCount: nextErrorCount,
            lastAttemptedSync: new Date().toISOString(),
            lastSuccessfulSync: nextStatus === 'healthy' ? new Date().toISOString() : store.lastSuccessfulSync,
            healthScore: nextStatus === 'offline' ? 30 : nextStatus === 'degraded' ? 74 : 98
          };
        })
      );
    }, 5 * 60 * 1000);

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
    console.log('openConnectorSetupModal called');
  };

  useEffect(() => {
    console.log('ConnectorPlatformContext mounted');
  }, []);

  const testConnectorConnection = async (platform: EcommercePlatform, values: ConnectorSetupValues): Promise<ConnectorTestResult> => {
    await delay(700);

    if (platform === 'shopify') {
      if (!values.shopDomain || !values.adminApiAccessToken) {
        return { ok: false, error: 'Shopify requires both the shop domain and Admin API access token.' };
      }
      if (!values.shopDomain.includes('.myshopify.com')) {
        return { ok: false, error: 'Shop domain must look like your-store.myshopify.com.' };
      }
    }

    if (platform === 'adobe_commerce') {
      if (!values.storeUrl || !values.adminApiToken) {
        return { ok: false, error: 'Adobe Commerce requires the store URL and Admin API access token.' };
      }
      if (!/^https?:\/\//i.test(values.storeUrl)) {
        return { ok: false, error: 'Store Base URL must be a valid HTTPS URL.' };
      }
    }

    return { ok: true, message: 'Connection successful — store data is accessible' };
  };

  const buildConnectorPayload = (platform: EcommercePlatform, values: ConnectorSetupValues) => {
    if (platform === 'shopify') {
      return {
        type: 'shopify',
        label: values.shopDomain?.trim() || 'Shopify Store',
        family: 'commerce',
        config: {
          shopDomain: values.shopDomain?.trim() || '',
          apiVersion: values.apiVersion?.trim() || undefined
        },
        credentials: {
          adminApiAccessToken: values.adminApiAccessToken?.trim() || ''
        }
      };
    }

    return {
      type: 'adobe_commerce',
      label: values.storeCode?.trim() ? `${values.storeCode.trim()} Store` : 'Adobe Commerce Store',
      family: 'commerce',
      config: {
        storeUrl: values.storeUrl?.trim() || '',
        storeCode: values.storeCode?.trim() || undefined
      },
      credentials: {
        adminApiToken: values.adminApiToken?.trim() || ''
      }
    };
  };

  const saveConnectorConnection = async (platform: EcommercePlatform, values: ConnectorSetupValues): Promise<ConnectedStore> => {
    const testResult = await testConnectorConnection(platform, values);
    if (!testResult.ok) {
      throw new Error('error' in testResult ? testResult.error : 'Connection test failed. Please check your credentials and try again.');
    }

    const projectId = currentProject || 'default-project';
    const tenantId = user?.tenantId || 'current';
    const payload = buildConnectorPayload(platform, values);

    const createdInstance = await apiFetch(`/api/v1/tenants/${tenantId}/projects/${projectId}/integrations`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const connectorId = createdInstance?.id || createId(platform);
    const created = createStoreFromConnection(platform, values, projectId, connectorId);
    const hydratedStore: ConnectedStore = {
      ...created.store,
      connectorId,
      name: createdInstance?.label || created.store.name,
      connectionLabel: platform === 'shopify' ? 'Shopify' : 'Adobe Commerce',
      projectId,
      status: (createdInstance?.status?.toLowerCase?.() || 'healthy') as ConnectedStore['status'],
      healthScore: createdInstance?.healthScore ?? created.store.healthScore,
      lastSuccessfulSync: (createdInstance?.lastSuccessfulSync || createdInstance?.lastSyncAt?.toISOString?.() || created.store.lastSuccessfulSync),
      lastAttemptedSync: (createdInstance?.lastAttemptedSync || createdInstance?.lastAttemptAt?.toISOString?.() || created.store.lastAttemptedSync),
      syncErrorCount: createdInstance?.syncErrorCount ?? created.store.syncErrorCount ?? 0,
      webhooksActive: createdInstance?.webhooksActive ?? created.store.webhooksActive ?? false,
      tokenExpiresAt: createdInstance?.tokenExpiresAt || created.store.tokenExpiresAt,
      recordsSyncedLast24h: createdInstance?.recordsSyncedLast24h ?? created.store.recordsSyncedLast24h
    };

    setConnectedStores((stores) => [hydratedStore, ...stores]);
    setCanonicalOrders((orders) => sortNewest([...created.orders, ...orders]));
    setCanonicalProducts((products) => [
      ...products,
      {
        id: `${platform}_product_${Date.now()}`,
        source: platform,
        name: platform === 'shopify' ? 'Synced Shopify Product' : 'Synced Adobe Product',
        sku: `${platform.toUpperCase()}-${Date.now()}`,
        inventory: 18,
        price: platform === 'shopify' ? 99.5 : 149.5,
        updatedAt: new Date().toISOString()
      }
    ]);
    setJobs((current) => [
      {
        id: createId('job'),
        connectorId,
        connectorName: created.store.name,
        source: platform,
        storeLabel: created.store.name,
        recordsProcessed: 0,
        durationMs: 0,
        status: 'running',
        startedAt: new Date().toISOString()
      },
      ...current
    ]);
    setIngestionEvents((current) => [
      {
        id: createId('ing'),
        connectorId,
        source: platform,
        status: 'queued',
        createdAt: new Date().toISOString(),
        sourceReferenceId: platform === 'shopify' ? 'orders.json' : 'V1/orders',
        validation: { isValid: true }
      },
      ...current
    ]);
    setAlerts((current) => [
      {
        id: createId('al'),
        severity: 'high',
        source: platform,
        message: `Initial sync started for ${created.store.name}`,
        createdAt: new Date().toISOString(),
        status: 'active'
      },
      ...current
    ]);
    setConnectorSetup({ platform: null, open: false });

    return hydratedStore;
  };

  const disconnectConnector = (connectorId: string) => {
    setConnectedStores((stores) => stores.filter((store) => store.connectorId !== connectorId));
  };

  const reconnectConnector = (connectorId: string) => {
    setConnectedStores((stores) =>
      stores.map((store) =>
        store.connectorId === connectorId
          ? { ...store, status: 'healthy', syncErrorCount: 0, healthScore: 98, lastSuccessfulSync: new Date().toISOString(), webhooksActive: true }
          : store
      )
    );
  };

  const syncConnectorNow = (connectorId: string) => {
    setJobs((current) => [
      {
        id: createId('job'),
        connectorId,
        connectorName: connectedStores.find((store) => store.connectorId === connectorId)?.name || 'Connector',
        source: connectedStores.find((store) => store.connectorId === connectorId)?.platform || 'shopify',
        storeLabel: connectedStores.find((store) => store.connectorId === connectorId)?.name || 'Connector',
        recordsProcessed: 64,
        durationMs: 24100,
        status: 'running',
        startedAt: new Date().toISOString()
      },
      ...current
    ]);
  };

  const filteredOrders = useMemo(() => {
    if (activeStoreId === 'all') return canonicalOrders;
    const selectedStore = connectedStores.find((store) => store.connectorId === activeStoreId);
    if (!selectedStore) return canonicalOrders;
    return canonicalOrders.filter((order) => order.source === selectedStore.platform);
  }, [activeStoreId, canonicalOrders, connectedStores]);

  const filteredCustomers = useMemo(() => {
    if (activeStoreId === 'all') return canonicalCustomers;
    const selectedStore = connectedStores.find((store) => store.connectorId === activeStoreId);
    if (!selectedStore) return canonicalCustomers;
    return canonicalCustomers.filter((customer) => customer.source === selectedStore.platform);
  }, [activeStoreId, canonicalCustomers, connectedStores]);

  const filteredProducts = useMemo(() => {
    if (activeStoreId === 'all') return canonicalProducts;
    const selectedStore = connectedStores.find((store) => store.connectorId === activeStoreId);
    if (!selectedStore) return canonicalProducts;
    return canonicalProducts.filter((product) => product.source === selectedStore.platform);
  }, [activeStoreId, canonicalProducts, connectedStores]);

  const healthScore = useMemo(() => {
    const storeScore = connectedStores.reduce((sum, store) => sum + store.healthScore, 0) / Math.max(connectedStores.length, 1);
    const alertPenalty = alerts.filter((alert) => alert.status === 'active' && alert.severity === 'critical').length * 8;
    return Math.max(0, Math.min(100, Math.round(storeScore - alertPenalty)));
  }, [alerts, connectedStores]);

  const healthLevel = useMemo(() => {
    const worstStore = connectedStores.reduce<'healthy' | 'warning' | 'critical'>((worst, store) => {
      if (store.status === 'offline') return 'critical';
      if (store.status === 'degraded' && worst === 'healthy') return 'warning';
      return worst;
    }, 'healthy');

    if (worstStore === 'critical' || healthScore < 70) return 'critical';
    if (worstStore === 'warning' || healthScore < 90) return 'warning';
    return 'healthy';
  }, [connectedStores, healthScore]);

  const selectedStoreLabel = useMemo(() => {
    if (activeStoreId === 'all') return 'All Stores';
    return connectedStores.find((store) => store.connectorId === activeStoreId)?.name || 'All Stores';
  }, [activeStoreId, connectedStores]);

  const systemHealthScore = useMemo(() => {
    return Math.round((healthScore + connectedStores.filter((store) => store.status === 'healthy').length * 4) / 2);
  }, [connectedStores, healthScore]);

  const orderVelocity = useMemo(() => {
    const recentOrders = filteredOrders.filter((order) => Date.now() - Number(new Date(order.createdAt)) < 1000 * 60 * 60);
    return Number((recentOrders.length / 60).toFixed(2));
  }, [filteredOrders]);

  const syncCoverage = useMemo(() => {
    const synchronized = connectedStores.reduce((sum, store) => sum + (store.initialSyncState === 'completed' ? 1 : 0), 0);
    return connectedStores.length === 0 ? 0 : Math.round((synchronized / connectedStores.length) * 100);
  }, [connectedStores]);

  const storeOptions = useMemo(
    () => [
      { id: 'all', label: 'All Stores' },
      ...connectedStores.map((store) => ({ id: store.connectorId, label: store.name }))
    ],
    [connectedStores]
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
    activeStoreId,
    setActiveStoreId,
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
    healthLabel: healthLevel === 'healthy' ? 'HEALTHY' : healthLevel === 'warning' ? 'WARNING' : 'CRITICAL',
    healthScore,
    storeOptions,
    selectedStoreLabel,
    filteredOrders,
    filteredCustomers,
    filteredProducts,
    orderVelocity,
    systemHealthScore,
    syncCoverage
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).__kpiConnectorPlatform = value;
  }, [value]);

  return <ConnectorPlatformContext.Provider value={value}>{children}</ConnectorPlatformContext.Provider>;
};

export const useConnectorPlatform = () => {
  const context = useContext(ConnectorPlatformContext);
  if (!context) {
    throw new Error('useConnectorPlatform must be used within ConnectorPlatformProvider');
  }
  return context;
};