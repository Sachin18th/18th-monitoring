import type { LucideIcon } from 'lucide-react';
import { Globe, KeyRound, ShoppingBag, Store, Tag } from 'lucide-react';

export type EcommercePlatform = 'shopify' | 'adobe_commerce';

export type ConnectorFieldType = 'text' | 'password';

export interface ConnectorFieldConfig {
  id: string;
  label: string;
  type: ConnectorFieldType;
  icon: LucideIcon;
  placeholder?: string;
  info: string;
}

export interface ConnectorHelpConfig {
  title: string;
  steps: string[];
  docsUrl: string;
  docsLabel: string;
}

export interface ConnectorConfig {
  name: string;
  icon: LucideIcon;
  help: ConnectorHelpConfig;
  fields: ConnectorFieldConfig[];
}

export type ConnectorsConfig = Record<EcommercePlatform, ConnectorConfig>;

export const connectorsConfig: ConnectorsConfig = {
  adobe_commerce: {
    name: 'Adobe Commerce',
    icon: Store,
    help: {
      title: 'How to get your Adobe Commerce Admin API token',
      steps: [
        'Open your Adobe Commerce Admin panel.',
        'Go to System → Extensions → Integrations.',
        'Create a new Integration and enable required API resources.',
        'Activate the integration to generate an Access Token.',
        "Paste the token here as 'Admin API Access Token'."
      ],
      docsUrl: 'https://developer.adobe.com/commerce/webapi/get-started/authentication/gs-authentication-token/',
      docsLabel: 'Adobe Commerce API auth docs'
    },
    fields: [
      {
        id: 'storeUrl',
        label: 'Store Base URL',
        type: 'text',
        icon: Globe,
        placeholder: 'https://your-store.com',
        info: 'The base URL of your Adobe Commerce / Magento instance.'
      },
      {
        id: 'adminApiToken',
        label: 'Admin API Access Token',
        type: 'password',
        icon: KeyRound,
        info: 'Used to authenticate all API calls to your Adobe Commerce instance.'
      },
      {
        id: 'storeCode',
        label: 'Store Code (optional)',
        type: 'text',
        icon: Tag,
        placeholder: 'default',
        info: "Leave as 'default' unless using multi-store setup."
      }
    ]
  },
  shopify: {
    name: 'Shopify',
    icon: ShoppingBag,
    help: {
      title: 'How to get your Shopify Admin API access token',
      steps: [
        'Open Shopify Admin.',
        'Go to Settings → Apps and sales channels → Develop apps.',
        'Create an app and configure Admin API scopes (read_orders, read_customers, read_products, read_analytics).',
        'Install the app to your store.',
        'Copy the Admin API access token.',
        'Enter your Shopify store domain (e.g. your-store.myshopify.com).'
      ],
      docsUrl: 'https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens',
      docsLabel: 'Shopify access tokens docs'
    },
    fields: [
      {
        id: 'shopDomain',
        label: 'Shop Domain',
        type: 'text',
        icon: Globe,
        placeholder: 'your-store.myshopify.com',
        info: 'Your Shopify store domain without https://'
      },
      {
        id: 'adminApiAccessToken',
        label: 'Admin API Access Token',
        type: 'password',
        icon: KeyRound,
        info: 'Create a custom app in Shopify Admin and generate an Admin API access token.'
      },
      {
        id: 'apiVersion',
        label: 'API Version (optional)',
        type: 'text',
        icon: Tag,
        placeholder: '2024-01',
        info: 'Leave blank to use the latest stable version.'
      }
    ]
  }
};

export type CanonicalOrderStatus = 'pending' | 'processing' | 'fulfilled' | 'cancelled' | 'refunded';

export type CanonicalLineItem = {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  price: number;
};

export type CanonicalOrder = {
  id: string;
  source: EcommercePlatform;
  status: CanonicalOrderStatus;
  revenue: number;
  currency: string;
  customerId: string;
  createdAt: string;
  updatedAt: string;
  items: CanonicalLineItem[];
};

export type CanonicalCustomer = {
  id: string;
  source: EcommercePlatform;
  email: string;
  name: string;
  orderCount: number;
  lifetimeValue: number;
  createdAt: string;
  tags: string[];
};

export type CanonicalProduct = {
  id: string;
  source: EcommercePlatform;
  name: string;
  sku: string;
  inventory: number;
  price: number;
  updatedAt: string;
};

export type ConnectorHealthStatus = 'healthy' | 'degraded' | 'offline';

export type ConnectorHealth = {
  connectorId: string;
  projectId: string;
  platform: EcommercePlatform;
  status: ConnectorHealthStatus;
  lastSuccessfulSync: string;
  lastAttemptedSync: string;
  syncErrorCount: number;
  webhooksActive: boolean;
  tokenExpiresAt?: string;
  recordsSyncedLast24h: number;
};

export type ConnectedStore = ConnectorHealth & {
  name: string;
  connectionLabel: string;
  storeUrl: string;
  storeCode?: string;
  shopDomain?: string;
  healthScore: number;
  syncProgress: number;
  initialSyncState: 'not_started' | 'in_progress' | 'completed';
  recordsByType: {
    orders: number;
    customers: number;
    products: number;
    sessions: number;
  };
};

export type ConnectorSetupValues = Record<string, string>;

export type ConnectorTestResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export type ConnectorAlert = {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: EcommercePlatform;
  message: string;
  createdAt: string;
  status: 'active' | 'resolved';
};

export type ConnectorIncident = {
  id: string;
  source: EcommercePlatform;
  connectorName: string;
  title: string;
  status: 'open' | 'triaged' | 'resolved';
  createdAt: string;
  timeline: Array<{ label: string; at: string; detail: string }>;
  resolutionHint: string;
};

export type ConnectorSyncJob = {
  id: string;
  connectorId: string;
  connectorName: string;
  source: EcommercePlatform;
  storeLabel: string;
  recordsProcessed: number;
  durationMs: number;
  status: 'running' | 'completed' | 'failed' | 'dead_lettered';
  startedAt: string;
};

export type IngestionEvent = {
  id: string;
  connectorId: string;
  source: EcommercePlatform;
  status: 'queued' | 'completed' | 'rejected' | 'failed';
  reason?: string;
  createdAt: string;
  sourceReferenceId: string;
  validation: { isValid: boolean };
};

export type ReconciliationCheck = {
  id: string;
  connectorId: string;
  source: EcommercePlatform;
  label: string;
  sourceCount: number;
  canonicalCount: number;
  gap: number;
  status: 'matched' | 'mismatch';
  checkedAt: string;
};

const timestamp = () => new Date().toISOString();

const createStoreRecordSet = (platform: EcommercePlatform, connectorId: string, values: ConnectorSetupValues, projectId: string): ConnectedStore => {
  const current = timestamp();
  const baseUrl = platform === 'shopify' ? `https://${values.shopDomain || 'new-store.myshopify.com'}` : values.storeUrl || 'https://new-store.example.com';

  return {
    connectorId,
    projectId,
    platform,
    status: 'healthy',
    lastSuccessfulSync: current,
    lastAttemptedSync: current,
    syncErrorCount: 0,
    webhooksActive: true,
    tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * (platform === 'shopify' ? 45 : 16)).toISOString(),
    recordsSyncedLast24h: platform === 'shopify' ? 320 : 256,
    name: platform === 'shopify' ? values.shopDomain || 'new-store.myshopify.com' : values.storeCode ? `${values.storeCode} Store` : 'Adobe Commerce Store',
    connectionLabel: platform === 'shopify' ? 'Shopify' : 'Adobe Commerce',
    storeUrl: baseUrl,
    shopDomain: values.shopDomain || undefined,
    storeCode: values.storeCode || undefined,
    healthScore: 100,
    syncProgress: 0,
    initialSyncState: 'in_progress',
    recordsByType: { orders: 0, customers: 0, products: 0, sessions: 0 }
  };
};

const buildOrdersForStore = (store: ConnectedStore): CanonicalOrder[] => {
  const current = timestamp();
  const prefix = store.platform === 'shopify' ? 'S' : 'M';

  return [
    {
      id: `${prefix}-${Date.now()}`,
      source: store.platform,
      status: 'pending',
      revenue: store.platform === 'shopify' ? 168.5 : 248.0,
      currency: 'USD',
      customerId: `${store.platform}_customer_${Date.now()}`,
      createdAt: current,
      updatedAt: current,
      items: [
        {
          id: `${prefix}-li-1`,
          productId: `${prefix}-prod-1`,
          name: store.platform === 'shopify' ? 'Starter Hoodie' : 'Catalog Bundle',
          quantity: 1,
          price: store.platform === 'shopify' ? 168.5 : 248.0
        }
      ]
    }
  ];
};

const seedConnectedStores = (): ConnectedStore[] => {
  const current = timestamp();
  return [
    {
      connectorId: 'conn_shopify_001',
      projectId: 'default-project',
      platform: 'shopify',
      status: 'healthy',
      lastSuccessfulSync: current,
      lastAttemptedSync: current,
      syncErrorCount: 0,
      webhooksActive: true,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      recordsSyncedLast24h: 1245,
      name: 'Northwind Shopify',
      connectionLabel: 'Shopify',
      storeUrl: 'https://northwind.myshopify.com',
      shopDomain: 'northwind.myshopify.com',
      healthScore: 97,
      syncProgress: 100,
      initialSyncState: 'completed',
      recordsByType: { orders: 420, customers: 312, products: 153, sessions: 2460 }
    },
    {
      connectorId: 'conn_adobe_001',
      projectId: 'default-project',
      platform: 'adobe_commerce',
      status: 'degraded',
      lastSuccessfulSync: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
      lastAttemptedSync: current,
      syncErrorCount: 2,
      webhooksActive: false,
      tokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 6).toISOString(),
      recordsSyncedLast24h: 740,
      name: 'Adobe Commerce EU',
      connectionLabel: 'Adobe Commerce',
      storeUrl: 'https://adobe.example.com',
      storeCode: 'default',
      healthScore: 81,
      syncProgress: 100,
      initialSyncState: 'completed',
      recordsByType: { orders: 208, customers: 186, products: 109, sessions: 1608 }
    }
  ];
};

const seedOrders = (): CanonicalOrder[] => {
  const current = Date.now();
  return [
    {
      id: '100245',
      source: 'shopify',
      status: 'fulfilled',
      revenue: 189.42,
      currency: 'USD',
      customerId: 'cus_shopify_01',
      createdAt: new Date(current - 1000 * 60 * 18).toISOString(),
      updatedAt: new Date(current - 1000 * 60 * 12).toISOString(),
      items: [{ id: 'li_1', productId: 'prod_1', name: 'Blue Hoodie', quantity: 1, price: 89.99 }]
    },
    {
      id: '100246',
      source: 'shopify',
      status: 'processing',
      revenue: 74.2,
      currency: 'USD',
      customerId: 'cus_shopify_02',
      createdAt: new Date(current - 1000 * 60 * 34).toISOString(),
      updatedAt: new Date(current - 1000 * 60 * 20).toISOString(),
      items: [{ id: 'li_2', productId: 'prod_2', name: 'Leather Wallet', quantity: 1, price: 74.2 }]
    },
    {
      id: '200712',
      source: 'adobe_commerce',
      status: 'processing',
      revenue: 421.1,
      currency: 'USD',
      customerId: 'cus_adobe_01',
      createdAt: new Date(current - 1000 * 60 * 44).toISOString(),
      updatedAt: new Date(current - 1000 * 60 * 36).toISOString(),
      items: [{ id: 'li_3', productId: 'prod_3', name: 'Enterprise Bundle', quantity: 2, price: 210.55 }]
    },
    {
      id: '200713',
      source: 'adobe_commerce',
      status: 'refunded',
      revenue: -65.8,
      currency: 'USD',
      customerId: 'cus_adobe_02',
      createdAt: new Date(current - 1000 * 60 * 82).toISOString(),
      updatedAt: new Date(current - 1000 * 60 * 70).toISOString(),
      items: [{ id: 'li_4', productId: 'prod_4', name: 'Accessory Pack', quantity: 1, price: 65.8 }]
    }
  ];
};

const seedCustomers = (): CanonicalCustomer[] => [
  {
    id: 'cus_shopify_01',
    source: 'shopify',
    email: 'ava@example.com',
    name: 'Ava Carter',
    orderCount: 4,
    lifetimeValue: 642.5,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(),
    tags: ['vip', 'email_subscriber']
  },
  {
    id: 'cus_shopify_02',
    source: 'shopify',
    email: 'morgan@example.com',
    name: 'Morgan Lee',
    orderCount: 1,
    lifetimeValue: 74.2,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    tags: ['new']
  },
  {
    id: 'cus_adobe_01',
    source: 'adobe_commerce',
    email: 'jordan@example.com',
    name: 'Jordan Smith',
    orderCount: 2,
    lifetimeValue: 819.1,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 130).toISOString(),
    tags: ['enterprise', 'renewal']
  },
  {
    id: 'cus_adobe_02',
    source: 'adobe_commerce',
    email: 'taylor@example.com',
    name: 'Taylor Brooks',
    orderCount: 1,
    lifetimeValue: 65.8,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 11).toISOString(),
    tags: ['guest']
  }
];

const seedProducts = (): CanonicalProduct[] => [
  { id: 'prod_1', source: 'shopify', name: 'Blue Hoodie', sku: 'HD-001', inventory: 24, price: 89.99, updatedAt: timestamp() },
  { id: 'prod_2', source: 'shopify', name: 'Leather Wallet', sku: 'LW-002', inventory: 57, price: 74.2, updatedAt: timestamp() },
  { id: 'prod_3', source: 'adobe_commerce', name: 'Enterprise Bundle', sku: 'EB-900', inventory: 11, price: 210.55, updatedAt: timestamp() },
  { id: 'prod_4', source: 'adobe_commerce', name: 'Accessory Pack', sku: 'AP-128', inventory: 46, price: 65.8, updatedAt: timestamp() }
];

const seedAlerts = (): ConnectorAlert[] => [
  {
    id: 'al_1',
    severity: 'critical',
    source: 'adobe_commerce',
    message: 'Connector sync failure detected for Adobe Commerce EU',
    createdAt: new Date(Date.now() - 1000 * 60 * 17).toISOString(),
    status: 'active'
  },
  {
    id: 'al_2',
    severity: 'medium',
    source: 'shopify',
    message: 'Token expiry within 7 days for Northwind Shopify',
    createdAt: new Date(Date.now() - 1000 * 60 * 61).toISOString(),
    status: 'active'
  },
  {
    id: 'al_3',
    severity: 'high',
    source: 'shopify',
    message: 'Webhook delivery failure for orders/create',
    createdAt: new Date(Date.now() - 1000 * 60 * 124).toISOString(),
    status: 'resolved'
  }
];

const seedIncidents = (): ConnectorIncident[] => [
  {
    id: 'inc_1',
    source: 'adobe_commerce',
    connectorName: 'Adobe Commerce EU',
    title: 'Connector offline for 6 minutes',
    status: 'open',
    createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    timeline: [
      { label: 'Detected', at: new Date(Date.now() - 1000 * 60 * 6).toISOString(), detail: 'Heartbeat missed twice in a row.' },
      { label: 'Escalated', at: new Date(Date.now() - 1000 * 60 * 4).toISOString(), detail: 'Critical alert auto-created.' }
    ],
    resolutionHint: 'Re-authenticate the connector, then re-run the webhook registration job.'
  }
];

const seedJobs = (): ConnectorSyncJob[] => [
  {
    id: 'job_1',
    connectorId: 'conn_shopify_001',
    connectorName: 'Northwind Shopify',
    source: 'shopify',
    storeLabel: 'Northwind Shopify',
    recordsProcessed: 438,
    durationMs: 42120,
    status: 'completed',
    startedAt: new Date(Date.now() - 1000 * 60 * 29).toISOString()
  },
  {
    id: 'job_2',
    connectorId: 'conn_adobe_001',
    connectorName: 'Adobe Commerce EU',
    source: 'adobe_commerce',
    storeLabel: 'Adobe Commerce EU',
    recordsProcessed: 112,
    durationMs: 28800,
    status: 'running',
    startedAt: new Date(Date.now() - 1000 * 60 * 7).toISOString()
  }
];

const seedIngestionEvents = (): IngestionEvent[] => [
  {
    id: 'ing_1',
    connectorId: 'conn_shopify_001',
    source: 'shopify',
    status: 'completed',
    createdAt: timestamp(),
    sourceReferenceId: 'orders/create',
    validation: { isValid: true }
  },
  {
    id: 'ing_2',
    connectorId: 'conn_adobe_001',
    source: 'adobe_commerce',
    status: 'rejected',
    reason: 'Canonical schema mismatch',
    createdAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    sourceReferenceId: 'V1/orders',
    validation: { isValid: false }
  }
];

const seedReconciliations = (): ReconciliationCheck[] => [
  {
    id: 'rec_1',
    connectorId: 'conn_shopify_001',
    source: 'shopify',
    label: 'Orders',
    sourceCount: 420,
    canonicalCount: 420,
    gap: 0,
    status: 'matched',
    checkedAt: timestamp()
  },
  {
    id: 'rec_2',
    connectorId: 'conn_adobe_001',
    source: 'adobe_commerce',
    label: 'Customers',
    sourceCount: 186,
    canonicalCount: 180,
    gap: 6,
    status: 'mismatch',
    checkedAt: timestamp()
  }
];

export const createInitialConnectorSnapshot = () => ({
  stores: seedConnectedStores(),
  orders: seedOrders(),
  customers: seedCustomers(),
  products: seedProducts(),
  alerts: seedAlerts(),
  incidents: seedIncidents(),
  jobs: seedJobs(),
  ingestionEvents: seedIngestionEvents(),
  reconciliations: seedReconciliations()
});

export const createStoreFromConnection = (platform: EcommercePlatform, values: ConnectorSetupValues, projectId: string, connectorId: string) => {
  const store = createStoreRecordSet(platform, connectorId, values, projectId);
  const orders = buildOrdersForStore(store);
  return { store, orders };
};
