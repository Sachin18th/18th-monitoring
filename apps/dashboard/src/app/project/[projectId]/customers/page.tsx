"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Users,
  Search,
  ChevronRight,
  Mail,
  Calendar,
  Shield,
  Smartphone,
  Globe,
  Clock,
  History,
  Fingerprint,
  UserCheck,
  ShoppingBag,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Accent palette chosen to stay legible on BOTH light and dark themes — mid-tone,
// saturated hues that never wash out on white or disappear on near-black.
const ACCENT = {
  indigo: "#6366f1",
  sky: "#0ea5e9",
  emerald: "#10b981",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  rose: "#f43f5e",
};
const SEGMENT_COLORS = [
  ACCENT.indigo,
  ACCENT.sky,
  ACCENT.emerald,
  ACCENT.violet,
  ACCENT.amber,
];

// Shared recharts tooltip styling, theme-aware via CSS vars.
const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-card)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "var(--text-primary)",
};
import { DiagnosticDrawer } from "@kpi-platform/ui";
import { useAuth } from "../../../../context/AuthContext";
import { PageRestricted } from "../../../../components/PageRestricted";
import { useConnectorFilter } from "../../../../hooks/useConnectorFilter";

type IdentityRow = {
  id: string;
  name: string;
  email: string;
  state: string;
  sessions: number;
  lastActive: string;
  createdAt?: string;
  lastSeenAt?: string;
  orderCount?: number;
  identityConfidence?: number;
  totalLtv?: number;
  currency?: string;
  metadata?: any;
  _raw?: any; // ← add this
};

const normalizeIdentityConfidence = (value: any): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) return undefined;

  if (numericValue > 1) {
    return Math.min(numericValue / 100, 1);
  }

  return numericValue;
};

const getCustomerOriginTrackingLabel = (customer: any) => {
  const metadata = customer?.metadata || {};

  return (
    metadata?.origin ||
    metadata?.source ||
    metadata?.sourceSystem ||
    metadata?.connectorLabel ||
    metadata?.connectorInstanceLabel ||
    metadata?.shopDomain ||
    metadata?.storeDomain ||
    metadata?.platform ||
    customer?.connectorLabel ||
    customer?.connectorInstanceId ||
    metadata?.connectorInstanceId ||
    metadata?.connectorId ||
    "Unknown source"
  );
};

type CustomerOrderRow = {
  id: string;
  orderId: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: string;
  connectorLabel?: string;
};

type CanonicalOrderRecord = {
  id?: string;
  orderId?: string;
  sourceSystem?: string;
  channel?: string;
  lifecycleState?: string;
  normalizedStatus?: string;
  currency?: string;
  totalAmount?: number | string;
  placedAt?: string;
  createdAt?: string;
  metadata?: any;
};

const normalizeLookupValue = (value?: string | null) => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const collectLookupValues = (...values: any[]) =>
  values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    .map((value) => normalizeLookupValue(value))
    .filter(Boolean);

const getOrderMetadata = (order: CanonicalOrderRecord): any => {
  const metadata = order?.metadata;
  if (!metadata) return {};
  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }
  return metadata;
};

const getCustomerMetadata = (customer: any): any => {
  const metadata = customer?.metadata;
  if (!metadata) return {};

  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }

  return metadata;
};

const customerMatchesActiveConnector = (
  customer: any,
  connectorInstanceId: string | null,
) => {
  if (!connectorInstanceId) return true;

  const metadata = getCustomerMetadata(customer);
  const externalIds = customer?.externalIds || metadata?.externalIds || {};
  const connectorCandidates = collectLookupValues(
    customer?.connectorInstanceId,
    customer?.connectorId,
    customer?.connectorLabel,
    customer?.sourceSystem,
    customer?.channel,
    metadata?.connectorInstanceId,
    metadata?.connectorId,
    metadata?.connectorLabel,
    metadata?.connectorInstanceLabel,
    metadata?.sourceSystem,
    metadata?.source,
    metadata?.platform,
    metadata?.shopDomain,
    metadata?.storeDomain,
    externalIds?.connectorInstanceId,
    externalIds?.connectorId,
    externalIds?.shopify,
    externalIds?.bigcommerce,
    externalIds?.adobe_commerce,
  );

  return connectorCandidates.includes(normalizeLookupValue(connectorInstanceId));
};

// Derive everything the customer cards show from the real customer_profiles
// records AND the canonical orders we already fetch. "Completed Orders", buyers,
// repeat buyers and LTV are computed by matching orders to each customer by
// email (the profile-level totalLtv / orders_count columns are often
// unpopulated), falling back to the stored profile values when no orders match.
const buildCustomerInsights = (customers: any[], orders: any[] = []) => {
  const total = customers.length;
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  // Monthly trend buckets: { newCustomers, revenue } keyed by YYYY-MM.
  const trendMap = new Map<
    string,
    { key: string; label: string; newCustomers: number; revenue: number }
  >();
  const trendBucket = (value?: string) => {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
    let bucket = trendMap.get(key);
    if (!bucket) {
      bucket = {
        key,
        label: parsed.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        }),
        newCustomers: 0,
        revenue: 0,
      };
      trendMap.set(key, bucket);
    }
    return bucket;
  };

  // Index orders by every email they carry → { completed order count, spend }.
  const orderStatsByEmail = new Map<
    string,
    { count: number; total: number }
  >();
  const orderCurrencyCounts: Record<string, number> = {};
  for (const order of orders) {
    const amount = Number(
      order?.totalAmount ??
        order?.metadata?.totalAmount ??
        order?.metadata?.amount ??
        0,
    );
    const orderCurrency = String(
      order?.currency || order?.metadata?.currency || "",
    )
      .trim()
      .toUpperCase();
    if (orderCurrency)
      orderCurrencyCounts[orderCurrency] =
        (orderCurrencyCounts[orderCurrency] || 0) + 1;

    const revenueBucket = trendBucket(
      order?.placedAt || order?.createdAt || order?.metadata?.placedAt,
    );
    if (revenueBucket && Number.isFinite(amount))
      revenueBucket.revenue += amount;

    const emails = Array.from(new Set(extractOrderEmailCandidates(order)));
    for (const email of emails) {
      const stats = orderStatsByEmail.get(email) || { count: 0, total: 0 };
      stats.count += 1;
      stats.total += Number.isFinite(amount) ? amount : 0;
      orderStatsByEmail.set(email, stats);
    }
  }

  let identified = 0;
  let buyers = 0;
  let repeatBuyers = 0;
  let totalLtv = 0;
  let totalOrders = 0;
  let newLast30 = 0;
  const lifecycleCounts: Record<string, number> = {};
  const currencyCounts: Record<string, number> = {};

  // Engagement recency buckets derived from lastSeenAt — a session-free stand-in
  // for the old "Top Traffic Attribution" block (the customer API carries no
  // session data). Thresholds are measured from now.
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
  const engagementCounts = { active: 0, warm: 0, atRisk: 0, dormant: 0 };

  for (const customer of customers) {
    const email = extractCustomerEmail(customer);
    if (email) identified += 1;

    // Completed orders for this customer = email-matched orders, falling back
    // to the stored profile count. Buyers / repeat buyers follow from this.
    const matched = email ? orderStatsByEmail.get(email) : undefined;
    const completedOrders = Math.max(
      matched?.count || 0,
      getCustomerOrderCount(customer),
    );
    totalOrders += completedOrders;
    if (completedOrders > 0) buyers += 1;
    if (completedOrders > 1) repeatBuyers += 1;

    const profileLtv = Number(customer?.totalLtv || 0);
    const ltv =
      (matched?.total || 0) > 0
        ? matched!.total
        : Number.isFinite(profileLtv)
          ? profileLtv
          : 0;
    totalLtv += ltv;

    const lifecycle = String(customer?.lifecycleState || "NEW_GUEST");
    lifecycleCounts[lifecycle] = (lifecycleCounts[lifecycle] || 0) + 1;

    const currency = String(customer?.metadata?.currency || "")
      .trim()
      .toUpperCase();
    if (currency) currencyCounts[currency] = (currencyCounts[currency] || 0) + 1;

    const firstSeen = customer?.firstSeenAt || customer?.metadata?.createdAt;
    if (firstSeen) {
      const seenAt = new Date(firstSeen).getTime();
      if (Number.isFinite(seenAt) && now - seenAt <= THIRTY_DAYS) newLast30 += 1;
      const acquisitionBucket = trendBucket(firstSeen);
      if (acquisitionBucket) acquisitionBucket.newCustomers += 1;
    }

    const lastSeen =
      customer?.lastSeenAt ||
      customer?.metadata?.lastSeenAt ||
      customer?.metadata?.updatedAt;
    if (lastSeen) {
      const lastSeenAt = new Date(lastSeen).getTime();
      if (Number.isFinite(lastSeenAt)) {
        const age = now - lastSeenAt;
        if (age <= SEVEN_DAYS) engagementCounts.active += 1;
        else if (age <= THIRTY_DAYS) engagementCounts.warm += 1;
        else if (age <= NINETY_DAYS) engagementCounts.atRisk += 1;
        else engagementCounts.dormant += 1;
      }
    }
  }

  // Chronological monthly trend, limited to the most recent 12 months.
  const monthlyTrend = Array.from(trendMap.values())
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(-12)
    .map(({ label, newCustomers, revenue }) => ({
      label,
      newCustomers,
      revenue: Math.round(revenue),
    }));

  // Pick the dominant currency from customer profiles, else from the orders.
  const currencyPool = Object.keys(currencyCounts).length
    ? currencyCounts
    : orderCurrencyCounts;
  const dominantCurrency =
    Object.entries(currencyPool).sort((a, b) => b[1] - a[1])[0]?.[0] || "USD";

  const lifecycle = Object.entries(lifecycleCounts)
    .map(([name, count]) => ({
      name,
      count,
      percent: total === 0 ? 0 : Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const share = (value: number) =>
    total === 0 ? 0 : Math.round((value / total) * 100);

  // Recency-based engagement, ordered healthiest → coldest.
  const engagement = [
    {
      name: "Active",
      hint: "Seen ≤ 7 days",
      count: engagementCounts.active,
      color: "#22c55e",
    },
    {
      name: "Warm",
      hint: "8–30 days",
      count: engagementCounts.warm,
      color: "#60a5fa",
    },
    {
      name: "At risk",
      hint: "31–90 days",
      count: engagementCounts.atRisk,
      color: "#f59e0b",
    },
    {
      name: "Dormant",
      hint: "> 90 days",
      count: engagementCounts.dormant,
      color: "#ef4444",
    },
  ].map((bucket) => ({ ...bucket, percent: share(bucket.count) }));

  // Real behavioral segments derived from the customer profiles we have.
  const segments = [
    { name: "Identified", size: identified, share: share(identified) },
    {
      name: "Anonymous",
      size: total - identified,
      share: share(total - identified),
    },
    { name: "Buyers", size: buyers, share: share(buyers) },
    { name: "Repeat buyers", size: repeatBuyers, share: share(repeatBuyers) },
    { name: "New (30d)", size: newLast30, share: share(newLast30) },
  ];

  return {
    total,
    identified,
    identifiedRatio: total === 0 ? 0 : Math.round((identified / total) * 100),
    buyers,
    repeatBuyers,
    repeatRate: buyers === 0 ? 0 : Math.round((repeatBuyers / buyers) * 100),
    totalOrders,
    totalLtv,
    avgLtv: total === 0 ? 0 : totalLtv / total,
    newLast30,
    dominantCurrency,
    lifecycle,
    segments,
    monthlyTrend,
    engagement,
  };
};

const extractCustomerEmail = (customer: any) => {
  const metadata = customer?.metadata || {};
  const rawCustomer = metadata?.rawCustomer || {};
  const externalIds = customer?.externalIds || {};

  // Try multiple email sources for the customer
  const email = normalizeLookupValue(
    customer?.email ||
      metadata?.email ||
      metadata?.customerEmail ||
      metadata?.contactEmail ||
      metadata?.emailAddress ||
      rawCustomer?.email ||
      rawCustomer?.customer_email ||
      externalIds?.email ||
      customer?.emailHash, // Fall back to hash if no clear email
  );

  // If we got an email, return it. If not, log for debugging
  if (email && email.length > 0) {
    return email;
  }

  // Debug: customer has no email
  if (process.env.NODE_ENV === "development") {
    console.debug(
      "[extractCustomerEmail] No email found for customer:",
      customer?.id,
      "email sources:",
      {
        customer_email: customer?.email,
        metadata_email: metadata?.email,
        raw_email: rawCustomer?.email,
      },
    );
  }

  return "";
};

const extractOrderEmailCandidates = (order: CanonicalOrderRecord) => {
  const metadata = getOrderMetadata(order);
  const orderRecord = order as any;
  const rawOrder =
    metadata?.rawOrder ||
    metadata?.adobeOrder ||
    metadata?.bigcommerceOrder ||
    {};

  // For BigCommerce orders, also check the order root level
  const bigcommerceOrder = metadata?.bigcommerceOrder || {};
  const adobeOrder = metadata?.adobeOrder || {};

  // CRITICAL: BigCommerce guest orders (customer_id=0) have email scattered
  // Check all possible locations including root level and nested structures
  const candidates = collectLookupValues(
    // Canonical order root-level fields
    orderRecord?.email,
    orderRecord?.customerEmail,
    orderRecord?.buyerEmail,
    orderRecord?.billing_email,
    orderRecord?.customer_email,
    orderRecord?.billingAddress?.email,
    orderRecord?.billing_address?.email,
    // Direct metadata fields
    metadata?.customerEmail,
    metadata?.buyerEmail,
    metadata?.email,
    metadata?.billing_email,
    metadata?.customer_email,
    metadata?.contactEmail,
    // BigCommerce specific (guest orders)
    bigcommerceOrder?.customer_email,
    bigcommerceOrder?.email,
    bigcommerceOrder?.billing_email,
    bigcommerceOrder?.contact_email,
    bigcommerceOrder?.billing_address?.email,
    bigcommerceOrder?.shipping_address?.email,
    bigcommerceOrder?.customer?.email,
    // Adobe/Magento specific
    adobeOrder?.customer_email,
    adobeOrder?.billing_address?.email,
    adobeOrder?.email,
    // Raw order fields
    rawOrder?.email,
    rawOrder?.contact_email,
    rawOrder?.customer_email,
    rawOrder?.billing_email,
    rawOrder?.customer?.email,
    rawOrder?.billing_address?.email,
    rawOrder?.shipping_address?.email,
    rawOrder?.extension_attributes?.shipping_assignments?.[0]?.shipping?.address?.email,
  );

  return candidates;
};

const normalizeEmbeddedOrder = (
  order: any,
  index: number,
  customer?: any,
): CustomerOrderRow => ({
  id: String(order?.id || order?.orderId || `${customer?.id || "customer"}-embedded-order-${index}`),
  orderId: String(order?.orderId || order?.id || `#${index + 1}`),
  status: String(
    order?.status ||
      order?.lifecycleState ||
      order?.normalizedStatus ||
      "unknown",
  ),
  amount: Number(order?.amount ?? order?.totalAmount ?? order?.revenue ?? 0),
  currency: String(order?.currency || customer?.metadata?.currency || "USD").toUpperCase(),
  createdAt: String(order?.createdAt || order?.placedAt || order?.updatedAt || ""),
  connectorLabel: String(
    order?.connectorLabel ||
      order?.connectorInstanceLabel ||
      order?.connectorInstanceId ||
      order?.connectorId ||
      customer?.metadata?.connectorLabel ||
      "Unknown connector",
  ),
});

const getEmailMatchedEmbeddedOrders = (customer: any): CustomerOrderRow[] => {
  const rawOrders = customer?.metadata?.orders;
  if (!Array.isArray(rawOrders) || rawOrders.length === 0) return [];

  const customerEmail = extractCustomerEmail(customer);
  if (!customerEmail) return [];

  const matchedOrders = rawOrders.filter((order: any) => {
    const emailCandidates = collectLookupValues(
      order?.email,
      order?.customerEmail,
      order?.buyerEmail,
      order?.billing_email,
      order?.customer_email,
      order?.billingAddress?.email,
      order?.billing_address?.email,
      order?.rawOrder?.email,
      order?.rawOrder?.customer_email,
      order?.rawOrder?.billing_address?.email,
      order?.bigcommerceOrder?.email,
      order?.bigcommerceOrder?.customer_email,
      order?.bigcommerceOrder?.billing_address?.email,
    );
    return emailCandidates.includes(customerEmail);
  });

  return sortOrdersByDateDesc(matchedOrders).map((order: any, index: number) =>
    normalizeEmbeddedOrder(order, index, customer),
  );
};

const formatDateLabel = (value?: string) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateTimeLabel = (value?: string) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatCurrency = (amount: number, currency = "USD") => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

// Compact currency for chart axes/tooltips, e.g. "$19.9K".
const formatCompactCurrency = (amount: number, currency = "USD") => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
};

const normalizeCustomerOrders = (customer: any): CustomerOrderRow[] => {
  const rawOrders = customer?.metadata?.orders;
  if (!Array.isArray(rawOrders)) return [];

  // SAFEGUARD: If embedded orders look suspicious (>100 orders for a single customer)
  // AND customer has NO email, this indicates the API is returning ALL orders in metadata
  // Log a warning instead
  const customerEmail = extractCustomerEmail(customer);
  if (rawOrders.length > 100 && (!customerEmail || customerEmail.length === 0)) {
    console.warn(
      `[normalizeCustomerOrders] SUSPICIOUS: Customer ${customer?.id} (NO EMAIL) has ${rawOrders.length} embedded orders. This might be ALL orders from API, not customer-specific. Returning empty to avoid data contamination.`,
    );
    return [];
  }

  return rawOrders
    .map((order: any, index: number) => ({
      id: String(
        order?.id ||
          order?.orderId ||
          `${customer?.id || "customer"}-order-${index}`,
      ),
      orderId: String(order?.orderId || order?.id || `#${index + 1}`),
      status: String(
        order?.status ||
          order?.lifecycleState ||
          order?.normalizedStatus ||
          "unknown",
      ),
      amount: Number(
        order?.amount ?? order?.totalAmount ?? order?.revenue ?? 0,
      ),
      currency: String(
        order?.currency || customer?.metadata?.currency || "USD",
      ).toUpperCase(),
      createdAt: String(
        order?.createdAt || order?.placedAt || order?.updatedAt || "",
      ),
    }))
    .sort(
      (left, right) =>
        Number(new Date(right.createdAt || 0)) -
        Number(new Date(left.createdAt || 0)),
    );
};

const normalizeCanonicalOrder = (
  order: CanonicalOrderRecord,
  index: number,
  customer?: any,
): CustomerOrderRow => {
  const metadata = getOrderMetadata(order);
  const orderId = String(
    order?.orderId || metadata?.orderId || order?.id || `#${index + 1}`,
  );
  const connectorLabel = String(
    metadata?.connectorLabel ||
      metadata?.connectorInstanceLabel ||
      metadata?.connectorInstanceId ||
      metadata?.connectorId ||
      order?.sourceSystem ||
      order?.channel ||
      "Unknown connector",
  );

  return {
    id: String(
      order?.id || orderId || `${customer?.id || "customer"}-order-${index}`,
    ),
    orderId,
    status: String(
      order?.normalizedStatus ||
        order?.lifecycleState ||
        metadata?.status ||
        "unknown",
    ),
    amount: Number(
      order?.totalAmount ?? metadata?.totalAmount ?? metadata?.amount ?? 0,
    ),
    currency: String(
      order?.currency ||
        metadata?.currency ||
        customer?.metadata?.currency ||
        "USD",
    ).toUpperCase(),
    createdAt: String(
      order?.placedAt ||
        order?.createdAt ||
        metadata?.placedAt ||
        metadata?.createdAt ||
        "",
    ),
    connectorLabel,
  };
};

const getCustomerConnectorKeys = (customer: any): string[] => {
  const metadata = customer?.metadata || {};
  const externalIds = customer?.externalIds || metadata?.externalIds || {};
  return Array.from(
    new Set(
      collectLookupValues(
        metadata?.connectorInstanceId,
        metadata?.connectorId,
        metadata?.connector,
        metadata?.sourceSystem,
        metadata?.source,
        externalIds?.connectorInstanceId,
        externalIds?.connectorId,
        externalIds?.shopify,
        externalIds?.adobe_commerce,
        externalIds?.bigcommerce,
        // Fix: safely check if bigcommerceCustomerId exists and is numeric
        // ...(metadata?.bigcommerceCustomerId && Number(metadata.bigcommerceCustomerId) !== 0
        //   ? [String(metadata.bigcommerceCustomerId)]
        //   : []),
        customer?.connectorInstanceId,
        customer?.connectorId,
      ),
    ),
  );
};

const getCustomerIdentityKeys = (customer: any): string[] => {
  const metadata = customer?.metadata || {};
  const rawCustomer = metadata?.rawCustomer || {};
  const externalIds = customer?.externalIds || metadata?.externalIds || {};
  return Array.from(
    new Set(
      collectLookupValues(
        customer?.id,
        metadata?.customerId,
        metadata?.customerID,
        metadata?.externalCustomerId,
        metadata?.externalReferenceId,
        metadata?.email,
        metadata?.customerEmail,
        rawCustomer?.id,
        rawCustomer?.id?.toString(),
        rawCustomer?.entity_id,
        rawCustomer?.email,
        // customer?.emailHash,
        externalIds?.customerId,
        externalIds?.customerID,
        externalIds?.shopify,
        externalIds?.adobe_commerce,
        externalIds?.bigcommerce, // ← ADD
        // metadata?.bigcommerceCustomerId.toString(), // ← ADD (numeric → string),
      ),
    ),
  );
};

const orderMatchesCustomer = (order: CanonicalOrderRecord, customer: any) => {
  // BigCommerce guest orders use customer_id = 0, so email is the only reliable link.
  const customerEmail = extractCustomerEmail(customer);
  if (!customerEmail) return false;

  const orderEmailCandidates = extractOrderEmailCandidates(order);
  const emailMatches = orderEmailCandidates.includes(customerEmail);

  if (process.env.NODE_ENV === "development") {
    console.debug(
      `[orderMatchesCustomer] EMAIL ONLY - Customer: ${customerEmail}, Order emails: ${orderEmailCandidates.join(", ") || "NONE"}, Match: ${emailMatches}`,
    );
  }

  return emailMatches;
};

const orderMatchesConnector = (order: CanonicalOrderRecord, customer: any) => {
  const metadata = order?.metadata || {};
  const customerConnectorKeys = getCustomerConnectorKeys(customer);

  if (customerConnectorKeys.length === 0) {
    return false;
  }

  const orderConnectorCandidates = Array.from(
    new Set(
      collectLookupValues(
        order?.sourceSystem,
        order?.channel,
        metadata?.connectorInstanceId,
        metadata?.connectorId,
        metadata?.connector,
        metadata?.sourceSystem,
        metadata?.source,
        metadata?.externalSourceId,
        metadata?.connectorLabel,
        metadata?.connectorInstanceLabel,
      ),
    ),
  );

  return orderConnectorCandidates.some((candidate) =>
    customerConnectorKeys.includes(candidate),
  );
};

const sortOrdersByDateDesc = <
  T extends { placedAt?: string; createdAt?: string; metadata?: any },
>(
  items: T[],
) =>
  [...items].sort((left, right) => {
    const leftDate = Number(
      new Date(
        left?.placedAt ||
          left?.createdAt ||
          left?.metadata?.placedAt ||
          left?.metadata?.createdAt ||
          0,
      ),
    );
    const rightDate = Number(
      new Date(
        right?.placedAt ||
          right?.createdAt ||
          right?.metadata?.placedAt ||
          right?.metadata?.createdAt ||
          0,
      ),
    );
    return rightDate - leftDate;
  });

const getCustomerOrderCount = (customer: any): number => {
  const rawOrders = customer?.metadata?.orders;
  const rawCustomerOrderCount = customer?.metadata?.rawCustomer?.orders_count;

  if (Array.isArray(rawOrders)) {
    return rawOrders.length;
  }

  if (typeof rawOrders === "number" && Number.isFinite(rawOrders)) {
    return rawOrders;
  }

  const fallbackCount = customer?.metadata?.orderCount;
  if (Array.isArray(fallbackCount)) {
    return fallbackCount.length;
  }

  if (typeof fallbackCount === "number" && Number.isFinite(fallbackCount)) {
    return fallbackCount;
  }

  if (
    typeof rawCustomerOrderCount === "number" &&
    Number.isFinite(rawCustomerOrderCount)
  ) {
    return rawCustomerOrderCount;
  }

  return 0;
};

const buildCustomerName = (customer: any): string => {
  const metadata = customer?.metadata || {};
  const rawCustomer = metadata?.rawCustomer || {};

  const firstName =
    metadata?.firstName || rawCustomer?.first_name || rawCustomer?.firstname;
  const lastName =
    metadata?.lastName || rawCustomer?.last_name || rawCustomer?.lastname;

  const fullName = [firstName, lastName]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join(" ");

  if (fullName) return fullName;

  return (
    metadata?.name ||
    metadata?.customerName ||
    (customer?.externalIds?.shopify
      ? `Customer ${String(customer.id).slice(0, 8)}`
      : "Unknown")
  );
};

const normalizeCustomerRecord = (customer: any): IdentityRow => ({
  id: customer.id,
  name: buildCustomerName(customer),
  email: extractCustomerEmail(customer) || customer.emailHash || "N/A",
  state: customer.lifecycleState || "NEW_GUEST",
  sessions: Number(
    customer.metadata?.sessionCount || customer.metadata?.sessions || 0,
  ),
  lastActive:
    customer.lastSeenAt ||
    customer.metadata?.lastSeenAt ||
    customer.metadata?.updatedAt ||
    new Date().toISOString(),
  createdAt: customer.firstSeenAt || customer.metadata?.createdAt,
  lastSeenAt: customer.lastSeenAt || customer.metadata?.lastSeenAt,
  orderCount: getCustomerOrderCount(customer),
  identityConfidence: normalizeIdentityConfidence(
    customer.identityConfidence ??
      customer.metadata?.identityConfidence ??
      customer.metadata?.identityScore ??
      customer.metadata?.confidence ??
      customer.metadata?.matchConfidence,
  ),
  totalLtv:
    typeof customer.totalLtv === "number"
      ? customer.totalLtv
      : Number(customer.totalLtv || 0),
  currency: customer.metadata?.currency || "USD",
  metadata: customer.metadata || {},
  _raw: customer, // ← add this line
});

export default function CustomersPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();

  const CUSTOMERS_PER_PAGE = 20; // Frontend pagination size
  const CUSTOMERS_FETCH_LIMIT = 10000; // Remove limit - fetch all available customers
  const lastFetchTimeRef = React.useRef(0);
  const isInitialLoad = React.useRef(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLifecycle, setFilterLifecycle] = useState("");
  const [allCustomers, setAllCustomers] = useState<any[]>([]); // Store all customers
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [intelligence, setIntelligence] = useState<any>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);

  const fetchData = useCallback(async (force = false) => {
    if (!token || !projectId) return;

    // Debounce: prevent fetching more than once per 2 seconds using ref (not state)
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < 2000) {
      return;
    }
    lastFetchTimeRef.current = now;

    if (isInitialLoad.current) {
      setLoading(true);
    }
    setError(null);
    try {
      const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`);
      const allowedPageKeys = Array.isArray(permissions?.allowedPageKeys)
        ? permissions.allowedPageKeys.map((value: any) => String(value))
        : Array.isArray(permissions?.data?.allowedPageKeys)
          ? permissions.data.allowedPageKeys.map((value: any) => String(value))
          : [];

      setAllowedPageKeys(allowedPageKeys);

      const canViewOrders = allowedPageKeys.includes('orders');
      const canViewCustomers = allowedPageKeys.includes('customers') || allowedPageKeys.includes('observability/journeys');

      // Fetch intelligence, customer list, and project orders in parallel.
      // (The /customers/summary endpoint is intentionally not called: its
      // headline numbers are derived/hardcoded server-side and we compute the
      // real ones from the customer list below.)
      const [intel, listRes, ordersRes] = await Promise.all([
        canViewCustomers
          ? apiFetch(`/api/v1/dashboard/customers/intelligence?siteId=${projectId}`)
          : Promise.resolve(null),
        canViewCustomers
          ? apiFetch(`/api/v1/dashboard/customers/list?siteId=${projectId}&limit=${CUSTOMERS_FETCH_LIMIT}&offset=0`)
          : Promise.resolve([]),
        canViewOrders
          ? apiFetch(`/api/v1/dashboard/orders/list?siteId=${projectId}`, {
              suppressUnauthorizedRedirect: true,
            }).catch(() => [])
          : Promise.resolve([]),
      ]);

      // Extract ALL customer list (no limit)
      const fullCustomerList = Array.isArray(listRes) ? listRes : [];
      const orderList = Array.isArray(ordersRes) ? ordersRes : [];

      const scopedCustomers = fullCustomerList.filter((customer) =>
        customerMatchesActiveConnector(customer, connectorInstanceId),
      );
      const scopedOrders = orderList.filter((order) =>
        orderMatchesConnector(order, {
          metadata: {
            connectorInstanceId,
          },
          connectorInstanceId,
        }),
      );

      setIntelligence(intel);

      console.log("[FETCH] Data received from API:", {
          customers: fullCustomerList.length,
          scopedCustomers: scopedCustomers.length,
          orders: orderList.length,
          scopedOrders: scopedOrders.length,
        timestamp: new Date().toISOString(),
      });

      // Log first customer email for debugging
      if (scopedCustomers.length > 0) {
        const firstCustomer = scopedCustomers[0];
        const firstEmail = extractCustomerEmail(firstCustomer);
        console.debug(
          "[CustomersPage] First customer email extraction:",
          firstEmail,
          "| Raw data:",
          {
            customer_email: firstCustomer?.email,
            metadata_email: firstCustomer?.metadata?.email,
            raw_customer_email: firstCustomer?.metadata?.rawCustomer?.email,
          },
        );
      }

      // Log order structure and emails for debugging
      if (scopedOrders.length > 0) {
        const firstOrder = scopedOrders[0];
        const emailCandidates = extractOrderEmailCandidates(firstOrder);
        console.debug(
          "[CustomersPage] First order email extraction:",
          emailCandidates,
          "| Raw data:",
          {
            order_id: firstOrder?.id || firstOrder?.orderId,
            metadata_email: firstOrder?.metadata?.email,
            metadata_customer_email: firstOrder?.metadata?.customerEmail,
            bigcommerce_email:
              firstOrder?.metadata?.bigcommerceOrder?.customer_email,
            bigcommerce_billing_email:
              firstOrder?.metadata?.bigcommerceOrder?.billing_address?.email,
            raw_order_email: firstOrder?.metadata?.rawOrder?.email,
          },
        );
      } else {
        console.warn(
          "[CustomersPage] No orders returned from API! This explains why all show same orders - falling back to embedded orders.",
        );
      }

      setAllCustomers(scopedCustomers);
      setCustomers(scopedCustomers.slice(0, CUSTOMERS_PER_PAGE));
      setOrders(scopedOrders);
      setCurrentPage(1); // Reset to first page when data refreshes
    } catch (e) {
      console.error("Failed to sync customer data:", e);
      setError("Failed to synchronize customer data. Please retry.");
    } finally {
      setLoading(false);
      isInitialLoad.current = false;
    }
  }, [projectId, token, apiFetch, connectorInstanceId]);

  useEffect(() => {
    fetchData();
    // No background polling: the periodic refetch reset the table to page 1 and
    // re-rendered the identity log every interval, which read as an auto-reload.
    // Data refreshes on mount and on project/connector change (effect below).
  }, [fetchData]);

  useEffect(() => {
    if (!token || !projectId) return;
    lastFetchTimeRef.current = 0;
    setLoading(true);
    setError(null);
    setAllCustomers([]);
    setCustomers([]);
    setOrders([]);
    setIntelligence(null);
    fetchData(true);
  }, [connectorSelectionTick, projectId, token, fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, []);

  // Filter customers by the search query (name, email, lifecycle state, id)
  // and by the selected lifecycle state.
  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const lifecycle = filterLifecycle.trim().toLowerCase();
    if (!query && !lifecycle) return allCustomers;
    return allCustomers.filter((customer) => {
      const record = normalizeCustomerRecord(customer);
      if (
        lifecycle &&
        String(customer?.lifecycleState || record.state || "").toLowerCase() !==
          lifecycle
      ) {
        return false;
      }
      if (!query) return true;
      const haystack = [
        record.name,
        record.email,
        record.state,
        record.id,
        customer?.lifecycleState,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [allCustomers, searchQuery, filterLifecycle]);

  // Distinct lifecycle states present in the data (for the filter dropdown).
  const lifecycleOptions = useMemo(
    () =>
      Array.from(
        new Set(
          allCustomers
            .map((customer) => String(customer?.lifecycleState || "").trim())
            .filter(Boolean),
        ),
      ).sort(),
    [allCustomers],
  );

  // Reset to the first page whenever the search query or filter changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterLifecycle]);

  // Calculate paginated customers based on filteredCustomers and currentPage
  useMemo(() => {
    const startIndex = (currentPage - 1) * CUSTOMERS_PER_PAGE;
    const endIndex = startIndex + CUSTOMERS_PER_PAGE;
    setCustomers(filteredCustomers.slice(startIndex, endIndex));
  }, [filteredCustomers, currentPage, CUSTOMERS_PER_PAGE]);

  // Calculate total pages
  const totalPages = Math.max(
    1,
    Math.ceil(filteredCustomers.length / CUSTOMERS_PER_PAGE),
  );

  const customerInsights = useMemo(
    () => buildCustomerInsights(allCustomers || [], orders || []),
    [allCustomers, orders],
  );

  const metricCards = useMemo(
    () => [
      {
        label: "Total Customers",
        value: loading ? "..." : customerInsights.total.toLocaleString(),
        badge: `${customerInsights.newLast30.toLocaleString()} new in last 30 days`,
        icon: Users,
        accent: ACCENT.indigo,
      },
      {
        label: "Identified Customers",
        value: loading ? "..." : `${customerInsights.identifiedRatio}%`,
        badge: `${customerInsights.identified.toLocaleString()} of ${customerInsights.total.toLocaleString()} have an email`,
        icon: Fingerprint,
        accent: ACCENT.sky,
      },
      {
        label: "Total Lifetime Value",
        value: loading
          ? "..."
          : formatCurrency(
              customerInsights.totalLtv,
              customerInsights.dominantCurrency,
            ),
        badge: `Avg ${formatCurrency(customerInsights.avgLtv, customerInsights.dominantCurrency)} per customer`,
        icon: Shield,
        accent: ACCENT.emerald,
      },
      {
        label: "Repeat Buyers",
        value: loading ? "..." : customerInsights.repeatBuyers.toLocaleString(),
        badge: `${customerInsights.repeatRate}% of ${customerInsights.buyers.toLocaleString()} buyers`,
        icon: UserCheck,
        accent: ACCENT.violet,
      },
    ],
    [loading, customerInsights],
  );

  const identities: IdentityRow[] =
    (customers || []).map(normalizeCustomerRecord) || [];
  // const selectedCustomerOrders = useMemo(
  //   () => {
  //     if (!selectedCustomer) return [];

  //     const expectedCount = getCustomerOrderCount(selectedCustomer);

  //     const strictMatchedOrders = sortOrdersByDateDesc(
  //       orders.filter((order) => orderMatchesCustomer(order, selectedCustomer))
  //     );

  //     if (strictMatchedOrders.length > 0) {
  //       const strictVisibleOrders = expectedCount > 0
  //         ? strictMatchedOrders.slice(0, expectedCount)
  //         : strictMatchedOrders;
  //       return strictVisibleOrders.map((order, index) => normalizeCanonicalOrder(order, index, selectedCustomer));
  //     }

  //     const connectorMatchedOrders = sortOrdersByDateDesc(
  //       orders.filter((order) => orderMatchesConnector(order, selectedCustomer))
  //     );

  //     if (connectorMatchedOrders.length > 0) {
  //       // Prefer strict customer matches first, then fill remaining rows from the same connector.
  //       const strictIds = new Set(strictMatchedOrders.map((order) => String(order?.id || order?.orderId || '')));
  //       const merged = [
  //         ...strictMatchedOrders,
  //         ...connectorMatchedOrders.filter((order) => !strictIds.has(String(order?.id || order?.orderId || '')))
  //       ];

  //       const trimmed = expectedCount > 0 ? merged.slice(0, expectedCount) : merged;
  //       return trimmed.map((order, index) => normalizeCanonicalOrder(order, index, selectedCustomer));
  //     }

  //     const embeddedOrders = normalizeCustomerOrders(selectedCustomer);
  //     return expectedCount > 0 ? embeddedOrders.slice(0, expectedCount) : embeddedOrders;
  //   },
  //   [orders, selectedCustomer]
  // );

  const selectedCustomerOrders = useMemo(() => {
    if (!selectedCustomer) return [];

    // Use raw customer for all matching logic
    const rawCustomer = (selectedCustomer as any)._raw ?? selectedCustomer;
    const customerEmail = extractCustomerEmail(rawCustomer);
    const expectedCount = getCustomerOrderCount(rawCustomer);

    // DEBUG: Log matching info
    console.debug(
      `[selectedCustomerOrders] Customer: ${rawCustomer?.id}, Email: ${customerEmail || "NO_EMAIL"}, Expected Orders: ${expectedCount}, Available orders from API: ${orders.length}`,
    );

    // Check embedded orders count
    const embeddedOrdersCount = Array.isArray(
      rawCustomer?.metadata?.orders,
    )
      ? rawCustomer?.metadata?.orders.length
      : 0;
    console.debug(
      `[selectedCustomerOrders] Embedded orders in customer metadata: ${embeddedOrdersCount}`,
    );

    // Primary: Try email-based matching for guests and identified customers
    const emailMatchedOrders = orders.filter((order) => {
      const matches = orderMatchesCustomer(order, rawCustomer);
      if (matches) {
        console.debug(
          `[selectedCustomerOrders] ✅ EMAIL MATCH - Order ${order?.id || order?.orderId} matched customer ${rawCustomer?.id}`,
        );
      }
      return matches;
    });

    if (emailMatchedOrders.length > 0) {
      const sortedOrders = sortOrdersByDateDesc(emailMatchedOrders);
      const visibleOrders =
        expectedCount > 0 ? sortedOrders.slice(0, expectedCount) : sortedOrders;

      console.debug(
        `[selectedCustomerOrders] 📊 EMAIL MATCH RESULT - Found ${visibleOrders.length}/${sortedOrders.length} matching orders from API for ${rawCustomer?.id}`,
      );

      return visibleOrders.map((order, index) =>
        normalizeCanonicalOrder(order, index, rawCustomer),
      );
    }

    console.debug(
      `[selectedCustomerOrders] ❌ No email matches found in ${orders.length} API orders`,
    );

    // IMPORTANT: No API email matches found for this customer.
    const uniqueOrderEmails = Array.from(
      new Set(
        orders
          .flatMap((order) => extractOrderEmailCandidates(order))
          .filter(Boolean),
      ),
    );

    const hasExactEmailInOrders =
      customerEmail.length > 0 && uniqueOrderEmails.includes(customerEmail);

    if (expectedCount > 0 || hasExactEmailInOrders) {
      console.warn(
        `[selectedCustomerOrders] ⚠️ NO EMAIL MATCHES - Customer ${rawCustomer?.id} (email: ${customerEmail || "NONE"}) has no matching orders from API (${orders.length} orders available).`,
      );
    } else if (process.env.NODE_ENV === "development") {
      console.debug(
        `[selectedCustomerOrders] No API orders expected for customer ${rawCustomer?.id} (${customerEmail || "NONE"}).`,
      );
    }

    if (process.env.NODE_ENV === "development") {
      const sampleOrderEmails = uniqueOrderEmails.slice(0, 12);
      console.debug(
        `[selectedCustomerOrders] Exact email present in orders: ${hasExactEmailInOrders}. Customer email: ${customerEmail || "NONE"}`,
      );
      console.debug(
        `[selectedCustomerOrders] Sample order emails from payload: ${sampleOrderEmails.join(", ") || "NONE"}`,
      );
    }

    const emailMatchedEmbeddedOrders = getEmailMatchedEmbeddedOrders(rawCustomer);
    if (emailMatchedEmbeddedOrders.length > 0) {
      const visibleEmbeddedOrders =
        expectedCount > 0
          ? emailMatchedEmbeddedOrders.slice(0, expectedCount)
          : emailMatchedEmbeddedOrders;

      console.warn(
        `[selectedCustomerOrders] Using email-matched embedded fallback: ${visibleEmbeddedOrders.length}/${emailMatchedEmbeddedOrders.length} orders for ${rawCustomer?.id}`,
      );

      return visibleEmbeddedOrders;
    }

    // Return empty array - don't fall back to embedded orders
    // This prevents showing the same orders for every customer
    return [];
  }, [orders, selectedCustomer]);

  // const selectedCustomerOrderCount = selectedCustomer
  //   ? getCustomerOrderCount(selectedCustomer)
  //   : 0;

  const selectedCustomerOrderCount = selectedCustomer
    ? getCustomerOrderCount((selectedCustomer as any)._raw ?? selectedCustomer)
    : 0;

  const selectedCustomerTotalSpend = selectedCustomerOrders.reduce(
    (sum, order) => sum + Number(order.amount || 0),
    0,
  );
  const selectedCustomerOrderCurrencies = Array.from(
    new Set(
      selectedCustomerOrders
        .map((order) =>
          String(order?.currency || "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  );
  const selectedCustomerTotalSpendCurrency =
    selectedCustomerOrderCurrencies.length === 1
      ? selectedCustomerOrderCurrencies[0]
      : String(
          selectedCustomer?.metadata?.currency ||
            selectedCustomer?.currency ||
            "USD",
        ).toUpperCase();
  const hasMixedSelectedOrderCurrencies =
    selectedCustomerOrderCurrencies.length > 1;

  // Lifetime value: prefer the actual sum of this customer's matched orders;
  // fall back to the stored profile LTV when no orders are matched.
  const selectedCustomerLifetimeValue =
    selectedCustomerTotalSpend > 0
      ? selectedCustomerTotalSpend
      : Number((selectedCustomer as any)?.totalLtv || 0);

  const isPageRestricted = allowedPageKeys !== null && !allowedPageKeys.includes('customers');

  // ========== ROOT-LEVEL DIAGNOSTIC LOGS ==========
  // These logs execute on EVERY render to trace state flow
  console.log("[DIAGNOSTIC] ===== COMPONENT RENDER CHECKPOINT =====");
  console.log("[DIAGNOSTIC] selectedCustomer:", {
    id: selectedCustomer?.id,
    email: selectedCustomer?.email,
    isNull: !selectedCustomer,
  });
  console.log("[DIAGNOSTIC] isDrawerOpen:", isDrawerOpen);
  console.log("[DIAGNOSTIC] orders from API:", {
    count: orders.length,
    isEmpty: orders.length === 0,
  });
  console.log("[DIAGNOSTIC] selectedCustomerOrders:", {
    count: selectedCustomerOrders.length,
    isEmpty: selectedCustomerOrders.length === 0,
  });
  console.log("[DIAGNOSTIC] drawer should render?", isDrawerOpen && selectedCustomer);
  // ================================================

  const panelStyle: React.CSSProperties = {
    borderRadius: "12px",
    border: "1px solid var(--border-card)",
    background: "var(--bg-card)",
    padding: "24px",
    overflow: "visible",
  };

  if (isPageRestricted) {
    return <PageRestricted pageKey="customers" />;
  }

  return (
    <>
      {/* Interaction polish: hover lift on metric cards. Theme-neutral shadow. */}
      <style>{`
        .ci-metric-card {
          transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
        }
        .ci-metric-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(99, 102, 241, 0.16);
          border-color: rgba(99, 102, 241, 0.4);
        }
      `}</style>
      <div
        style={{
          padding: "24px 28px",
          width: "90%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          overflow: "visible",
        }}
      >
        <div style={{ marginBottom: "8px", overflow: "visible" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "6px",
            }}
          >
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                border: "1px solid var(--border-card)",
                background: "var(--bg-card)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Users
                style={{
                  width: "16px",
                  height: "16px",
                  color: "var(--text-secondary)",
                }}
              />
            </div>
            <span
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-label)",
                marginBottom: "0",
              }}
            >
              Identity Analytics
            </span>
          </div>

          <div
            style={{
              fontSize: "26px",
              fontWeight: 500,
              color: "var(--text-primary)",
              marginBottom: "6px",
            }}
          >
            Customer Intelligence Lab
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#22c55e",
                display: "inline-block",
                marginLeft: "10px",
                verticalAlign: "middle",
              }}
            />
          </div>

          <div
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              lineHeight: 1.6,
              maxWidth: "760px",
            }}
          >
            Strategic behavioral analysis, funnel exploration, and
            identity-aware journey tracking.
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "20px",
            overflow: "visible",
          }}
        >
          {metricCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="ci-metric-card"
                style={{
                  position: "relative",
                  borderRadius: "12px",
                  border: "1px solid var(--border-card)",
                  background: "var(--bg-card)",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: "140px",
                  overflow: "visible",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "var(--text-label)",
                      fontWeight: 500,
                    }}
                  >
                    {card.label}
                  </span>
                  <span
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      // ~14% tint of the accent works on light and dark alike.
                      background: `${card.accent}24`,
                      flexShrink: 0,
                    }}
                  >
                    <Icon
                      style={{
                        width: "16px",
                        height: "16px",
                        flexShrink: 0,
                        color: card.accent,
                      }}
                    />
                  </span>
                </div>

                <div
                  style={{
                    fontSize: "38px",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    lineHeight: 1,
                    padding: "8px 0",
                  }}
                >
                  {card.value}
                </div>

                <div style={{ marginTop: "12px" }}>
                  <span style={{ fontSize: "12px", color: card.accent }}>
                    {card.badge}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={panelStyle}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-primary)",
              marginBottom: "4px",
            }}
          >
            Customer Acquisition & Revenue
          </div>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: "999px",
              fontSize: "10px",
              border: "1px solid var(--border-input)",
              color: "var(--text-muted)",
              display: "inline-block",
              whiteSpace: "nowrap",
            }}
          >
            Monthly · new customers vs revenue
          </span>

          <div style={{ width: "100%", height: 300, marginTop: "20px" }}>
            {!loading && customerInsights.monthlyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={customerInsights.monthlyTrend}
                  margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border-card)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                    tickFormatter={(value) =>
                      formatCompactCurrency(
                        Number(value),
                        customerInsights.dominantCurrency,
                      )
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-card)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: any, name: any) =>
                      name === "Revenue"
                        ? formatCurrency(
                            Number(value),
                            customerInsights.dominantCurrency,
                          )
                        : Number(value).toLocaleString()
                    }
                  />
                  <Legend iconType="circle" />
                  <Bar
                    yAxisId="left"
                    dataKey="newCustomers"
                    name="New customers"
                    fill="#60a5fa"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "13px",
                  color: "var(--text-muted)",
                }}
              >
                {loading
                  ? "Loading customer trend..."
                  : "No customer activity to chart yet."}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px",
            overflow: "visible",
          }}
        >
          <div style={panelStyle}>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-primary)",
                marginBottom: "20px",
              }}
            >
              Behavioral Segmentation
            </div>

            {!loading && customerInsights.segments.length > 0 ? (
              <>
                <div style={{ width: "100%", height: 230 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={customerInsights.segments}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                      barCategoryGap={14}
                    >
                      <CartesianGrid
                        horizontal={false}
                        stroke="var(--border-card)"
                        strokeDasharray="3 3"
                      />
                      <XAxis type="number" hide allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={96}
                        tickLine={false}
                        axisLine={false}
                        stroke="var(--text-muted)"
                        fontSize={12}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--bg-input)" }}
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: any, _name: any, entry: any) => [
                          `${Number(value).toLocaleString()} users · ${entry?.payload?.share ?? 0}%`,
                          entry?.payload?.name ?? "Segment",
                        ]}
                      />
                      <Bar dataKey="size" radius={[0, 6, 6, 0]} maxBarSize={26}>
                        {customerInsights.segments.map((segment, idx) => (
                          <Cell
                            key={`${segment.name}-${idx}`}
                            fill={SEGMENT_COLORS[idx % SEGMENT_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px 16px",
                    marginTop: "12px",
                  }}
                >
                  {customerInsights.segments.map((segment, idx) => (
                    <span
                      key={`${segment.name}-legend-${idx}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "2px",
                          background:
                            SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
                          flexShrink: 0,
                        }}
                      />
                      {segment.name}
                      <span style={{ color: "var(--text-muted)" }}>
                        {segment.size.toLocaleString()} · {segment.share}%
                      </span>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  lineHeight: 1.6,
                  padding: "24px 0",
                }}
              >
                {loading
                  ? "Loading segments..."
                  : "No customer segments to chart yet."}
              </div>
            )}
          </div>

          <div style={panelStyle}>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-primary)",
                marginBottom: "6px",
              }}
            >
              Customer Lifecycle
            </div>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: "999px",
                fontSize: "10px",
                border: "1px solid var(--border-input)",
                color: "var(--text-muted)",
                display: "inline-block",
                whiteSpace: "nowrap",
              }}
            >
              {customerInsights.total.toLocaleString()} profiles ·{" "}
              {customerInsights.buyers.toLocaleString()} buyers
            </span>

            <div
              style={{
                marginTop: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              {(loading ? [] : customerInsights.lifecycle).map((row, idx) => (
                <div key={`${row.name}-${idx}`}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "6px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--text-primary)",
                        fontWeight: 500,
                      }}
                    >
                      {row.name}
                    </span>
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {row.count.toLocaleString()} · {row.percent}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      borderRadius: "999px",
                      background: "var(--bg-input)",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(4, row.percent)}%`,
                        height: "100%",
                        borderRadius: "999px",
                        background:
                          "linear-gradient(90deg, #60a5fa 0%, #22c55e 100%)",
                      }}
                    />
                  </div>
                </div>
              ))}
              {!loading && customerInsights.lifecycle.length === 0 && (
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  No customer profiles yet.
                </span>
              )}
            </div>

            <div style={{ marginTop: "20px" }}>
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-label)",
                }}
              >
                Engagement by Recency
              </div>

              {loading ? (
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    display: "block",
                    marginTop: "8px",
                  }}
                >
                  Loading engagement data...
                </span>
              ) : customerInsights.engagement.every(
                  (bucket) => bucket.count === 0,
                ) ? (
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    display: "block",
                    marginTop: "8px",
                  }}
                >
                  No recent activity recorded yet.
                </span>
              ) : (
                <div
                  style={{
                    marginTop: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "20px",
                  }}
                >
                  {/* Donut: each slice = a recency bucket; center = total profiles. */}
                  <div
                    style={{
                      position: "relative",
                      width: "132px",
                      height: "132px",
                      flexShrink: 0,
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={customerInsights.engagement.filter(
                            (bucket) => bucket.count > 0,
                          )}
                          dataKey="count"
                          nameKey="name"
                          innerRadius={44}
                          outerRadius={64}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {customerInsights.engagement
                            .filter((bucket) => bucket.count > 0)
                            .map((bucket) => (
                              <Cell key={bucket.name} fill={bucket.color} />
                            ))}
                        </Pie>
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(value: any, _name: any, entry: any) => [
                            `${Number(value).toLocaleString()} · ${entry?.payload?.percent ?? 0}%`,
                            entry?.payload?.name ?? "",
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "20px",
                          fontWeight: 600,
                          color: "var(--text-primary)",
                          lineHeight: 1,
                        }}
                      >
                        {customerInsights.total.toLocaleString()}
                      </span>
                      <span
                        style={{
                          fontSize: "10px",
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          marginTop: "2px",
                        }}
                      >
                        Profiles
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      minWidth: 0,
                    }}
                  >
                    {customerInsights.engagement.map((bucket) => (
                      <div
                        key={bucket.name}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "13px",
                            color: "var(--text-primary)",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span
                            style={{
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              background: bucket.color,
                              flexShrink: 0,
                            }}
                          />
                          {bucket.name}
                          <span style={{ color: "var(--text-muted)" }}>
                            {" "}
                            · {bucket.hint}
                          </span>
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {bucket.count.toLocaleString()} · {bucket.percent}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ overflow: "visible" }}>
          <div
            style={{
              fontSize: "12px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-muted)",
              marginBottom: "12px",
            }}
          >
            Recent Identity Log
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto auto",
              gap: "12px",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <div style={{ position: "relative" }}>
              <Search
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: "16px",
                  height: "16px",
                  color: "#64748b",
                }}
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, lifecycle, or ID..."
                style={{
                  width: "100%",
                  height: "40px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-card)",
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  padding: "0 12px 0 36px",
                  fontSize: "14px",
                }}
              />
            </div>
            <select
              value={filterLifecycle}
              onChange={(e) => setFilterLifecycle(e.target.value)}
              style={{
                height: "40px",
                borderRadius: "8px",
                border: "1px solid var(--border-card)",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                padding: "0 12px",
                fontSize: "14px",
              }}
            >
              <option value="">All Lifecycles</option>
              {lifecycleOptions.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setFilterLifecycle("");
                setSearchQuery("");
              }}
              style={{
                height: "40px",
                borderRadius: "8px",
                border: "1px solid var(--border-card)",
                background: "#dee3ee",
                color: "var(--text-primary)",
                padding: "0 14px",
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                height: "40px",
                borderRadius: "8px",
                border: "1px solid var(--border-card)",
                background: "var(--bg-input)",
                color: "var(--text-muted)",
                padding: "0 12px",
                fontSize: "12px",
                whiteSpace: "nowrap",
              }}
            >
              <Users style={{ width: "16px", height: "16px", flexShrink: 0 }} />
              Page {currentPage} of {totalPages} · {filteredCustomers.length}{" "}
              matching
            </div>
          </div>

          <div
            style={{
              borderRadius: "12px",
              border: "1px solid var(--border-card)",
              background: "var(--bg-card)",
              padding: "0",
              overflow: "visible",
            }}
          >
            <div
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid var(--border-card)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  alignItems: "center",
                  color: "var(--text-label)",
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                <span style={{ flex: 2 }}>Customer Identity</span>
                <span style={{ flex: 1 }}>Lifecycle State</span>
                {/* <span style={{ width: "80px", textAlign: "right" }}>
                  Sessions
                </span> */}
                <span style={{ width: "120px", textAlign: "right" }}>
                  Last Active
                </span>
                <span style={{ width: "24px" }} />
              </div>
            </div>

            {(loading ? [] : identities).map((customer, idx) => (
              <button
                key={customer.id || `${customer.email}-${idx}`}
                type="button"
                onClick={() => {
                  console.log("[CLICK] Customer row clicked:", {
                    id: customer.id,
                    email: customer.email,
                  });
                  setSelectedCustomer(customer);
                  setIsDrawerOpen(true);
                }}
                style={{
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  padding: "14px 20px",
                  borderBottom:
                    idx === identities.length - 1
                      ? "none"
                      : "1px solid var(--border-card)",
                  display: "flex",
                  gap: "16px",
                  alignItems: "center",
                  textAlign: "left",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                }}
              >
                <div
                  style={{
                    flex: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      background: "rgba(96,165,250,0.12)",
                      border: "1px solid rgba(96,165,250,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#60a5fa",
                      fontSize: "12px",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {customer.name?.charAt(0) || "?"}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--text-primary)",
                        fontWeight: 500,
                        marginBottom: "2px",
                      }}
                    >
                      {customer.name}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {customer.email}
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      borderRadius: "999px",
                      fontSize: "10px",
                      border: "1px solid var(--border-input)",
                      color:
                        customer.state === "VIP"
                          ? "#22c55e"
                          : "var(--text-secondary)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {customer.state}
                  </span>
                </div>

                {/* <div
                  style={{
                    width: "80px",
                    textAlign: "right",
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                  }}
                >
                  {customer.sessions}
                </div> */}
                <div
                  style={{
                    width: "120px",
                    textAlign: "right",
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                  }}
                >
                  {formatDateTimeLabel(customer.lastActive)}
                </div>
                <ChevronRight
                  style={{
                    width: "16px",
                    height: "16px",
                    color: "var(--text-label)",
                    flexShrink: 0,
                  }}
                />
              </button>
            ))}
            {loading && (
              <div
                style={{
                  padding: "18px 20px",
                  fontSize: "13px",
                  color: "var(--text-muted)",
                }}
              >
                Loading identity log...
              </div>
            )}
            {!loading && identities.length === 0 && (
              <div
                style={{
                  padding: "18px 20px",
                  fontSize: "13px",
                  color: "var(--text-muted)",
                }}
              >
                {searchQuery.trim()
                  ? `No identities match "${searchQuery.trim()}". Adjust your search to broaden results.`
                  : "No customer identities found."}
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 20px",
              marginTop: "12px",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              Page {currentPage} of {totalPages}
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-card)",
                  background:
                    currentPage === 1 ? "var(--bg-input)" : "var(--bg-card)",
                  color: "var(--text-secondary)",
                  cursor: currentPage === 1 ? "not-allowed" : "pointer",
                  fontSize: "12px",
                  opacity: currentPage === 1 ? 0.5 : 1,
                }}
              >
                ← Previous
              </button>
              <button
                onClick={() =>
                  setCurrentPage(Math.min(totalPages, currentPage + 1))
                }
                disabled={currentPage === totalPages}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-card)",
                  background:
                    currentPage === totalPages
                      ? "var(--bg-input)"
                      : "var(--bg-card)",
                  color: "var(--text-secondary)",
                  cursor:
                    currentPage === totalPages ? "not-allowed" : "pointer",
                  fontSize: "12px",
                  opacity: currentPage === totalPages ? 0.5 : 1,
                }}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "fixed",
          bottom: "20px",
          left: "24px",
          zIndex: 50,
          background: "var(--bg-card)",
          border: "1px solid var(--border-input)",
          borderRadius: "999px",
          padding: "6px 14px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "11px",
          color: "var(--text-muted)",
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "#22c55e",
            flexShrink: 0,
          }}
        />
        Live feed · System nominal
      </div>

      <DiagnosticDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Customer Identity Profile"
        subtitle={`Identity ID: ${selectedCustomer?.id} • Lifecycle: ${selectedCustomer?.state}`}
        width="700px"
      >
        {selectedCustomer && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "32px" }}
          >
            <section
              style={{
                display: "flex",
                alignItems: "center",
                gap: "24px",
                padding: "24px",
                background: "var(--bg-input)",
                borderRadius: "24px",
                border: "1px solid var(--border-card)",
              }}
            >
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  background: "#60a5fa",
                  color: "var(--text-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "32px",
                  fontWeight: 700,
                  border: "4px solid var(--border-card)",
                  flexShrink: 0,
                }}
              >
                {selectedCustomer.name.charAt(0)}
              </div>
              <div>
                <div
                  style={{
                    fontSize: "28px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    lineHeight: 1.2,
                  }}
                >
                  {selectedCustomer.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "var(--text-muted)",
                    fontSize: "14px",
                    marginTop: "8px",
                  }}
                >
                  <Mail
                    style={{ width: "16px", height: "16px", flexShrink: 0 }}
                  />
                  {selectedCustomer.email}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    marginTop: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  {[
                    selectedCustomer.state,
                    extractCustomerEmail(
                      (selectedCustomer as any)?._raw ?? selectedCustomer,
                    )
                      ? "Identified"
                      : "Anonymous",
                  ].map(
                    (label, idx) => (
                      <span
                        key={`${label}-${idx}`}
                        style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: "999px",
                          fontSize: "10px",
                          border: "1px solid var(--border-input)",
                          color:
                            idx === 0 ? "#22c55e" : "var(--text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {label}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </section>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
              }}
            >
              {[
                {
                  icon: Calendar,
                  label: "Customer Since",
                  value: formatDateLabel(
                    selectedCustomer?.lastSeenAt ||
                      selectedCustomer?.createdAt ||
                      selectedCustomer?.metadata?.lastSeenAt,
                  ),
                },
                {
                  icon: Globe,
                  label: "Origin Tracking",
                  value: getCustomerOriginTrackingLabel(selectedCustomer),
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    style={{
                      padding: "16px",
                      borderRadius: "18px",
                      border: "1px solid var(--border-card)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "var(--text-muted)",
                      }}
                    >
                      <Icon
                        style={{ width: "16px", height: "16px", flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontSize: "11px",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {item.label}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        color: "var(--text-primary)",
                        fontWeight: 500,
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                );
              })}
            </div>

            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "16px",
              }}
            >
              {[
                {
                  icon: UserCheck,
                  label: "Identity Confidence",
                  value:
                    typeof selectedCustomer?.identityConfidence === "number"
                      ? `${Math.round(Number(selectedCustomer.identityConfidence) * 100)}%`
                      : "N/A",
                },
                {
                  icon: Fingerprint,
                  label: "Completed Orders",
                  value: Math.max(
                    selectedCustomerOrderCount,
                    selectedCustomerOrders.length,
                  ).toLocaleString(),
                },
                {
                  icon: Shield,
                  label: "Lifetime Value",
                  value: formatCurrency(
                    selectedCustomerLifetimeValue,
                    selectedCustomerTotalSpendCurrency,
                  ),
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    style={{
                      padding: "16px",
                      borderRadius: "18px",
                      border: "1px solid var(--border-card)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "var(--text-muted)",
                      }}
                    >
                      <Icon
                        style={{ width: "16px", height: "16px", flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontSize: "11px",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {item.label}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                        color: "var(--text-primary)",
                        fontWeight: 500,
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                );
              })}
            </section>

            <section>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <ShoppingBag
                    style={{
                      width: "16px",
                      height: "16px",
                      color: "var(--text-muted)",
                    }}
                  />
                  <div
                    style={{
                      fontSize: "14px",
                      color: "var(--text-primary)",
                      fontWeight: 500,
                    }}
                  >
                    All Orders
                  </div>
                </div>
                {hasMixedSelectedOrderCurrencies && (
                  <div
                    style={{ fontSize: "12px", color: "var(--text-muted)" }}
                  >
                    Mixed currencies
                  </div>
                )}
              </div>

              <div
                style={{
                  borderRadius: "18px",
                  border: "1px solid var(--border-card)",
                  background: "var(--bg-card)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border-card)",
                    display: "grid",
                    gridTemplateColumns: "1.1fr 1fr 1fr 1fr",
                    gap: "12px",
                    color: "var(--text-label)",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  <span>Order</span>
                  <span>Status</span>
                  <span>Amount</span>
                  <span>Date</span>
                </div>

                {selectedCustomerOrders.length > 0 ? (
                  selectedCustomerOrders.map((order) => (
                    <div
                      key={order.id}
                      style={{
                        padding: "14px 16px",
                        display: "grid",
                        gridTemplateColumns: "1.1fr 1fr 1fr 1fr",
                        gap: "12px",
                        borderTop: "1px solid var(--border-card)",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          color: "var(--text-primary)",
                          fontWeight: 500,
                        }}
                      >
                        {order.orderId}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {order.status}
                        {order.connectorLabel
                          ? ` · ${order.connectorLabel}`
                          : ""}
                      </span>
                      <span
                        style={{
                          fontSize: "13px",
                          color: "var(--text-primary)",
                        }}
                      >
                        {formatCurrency(order.amount, order.currency)}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {formatDateTimeLabel(order.createdAt)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      padding: "16px",
                      color: "var(--text-muted)",
                      fontSize: "13px",
                    }}
                  >
                    No matching orders were found for this customer in the
                    current project or connector.
                  </div>
                )}
              </div>
            </section>

            {/* <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <History style={{ width: '16px', height: '16px', color: 'var(--text-muted)' }} />
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>Behavioral Journey</div>
                </div>
                <button
                  type="button"
                  style={{
                    border: '1px solid var(--border-card)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    borderRadius: '10px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  View full session log
                </button>
              </div>

              <div style={{ borderLeft: '1px solid var(--border-card)', marginLeft: '10px', paddingLeft: '24px' }}>
                {[
                  { time: '2m ago', event: 'Purchased Order #4421', desc: 'Basket Value: $244.10', icon: Shield, color: '#22c55e' },
                  { time: '12m ago', event: 'Completed Checkout Stage 3', desc: 'Payment Method: Visa • 4421', icon: Clock, color: 'var(--text-secondary)' },
                  { time: '4h ago', event: 'Session Started (Direct)', desc: 'Device: Apple iPhone 15 Pro • iOS 17.4', icon: Smartphone, color: 'var(--text-secondary)' },
                  { time: '2d ago', event: 'Engaged with Loyalty Reward', desc: 'Claimed: 15% Welcome Discount', icon: Activity, color: '#60a5fa' }
                ].map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <div key={`${item.event}-${idx}`} style={{ position: 'relative', paddingBottom: idx === 3 ? '0' : '24px' }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: '-29px',
                          top: '4px',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: 'var(--bg-card)',
                          border: '2px solid #60a5fa'
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <Icon style={{ width: '16px', height: '16px', color: item.color, flexShrink: 0, marginTop: '2px' }} />
                          <div>
                            <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{item.event}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{item.desc}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                          {item.time}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section> */}

            {/* <section style={{ paddingTop: '16px', borderTop: '1px solid var(--border-card)', display: 'flex', gap: '16px' }}>
              <button
                type="button"
                style={{
                  flex: 1,
                  borderRadius: '12px',
                  border: '1px solid rgba(96,165,250,0.2)',
                  background: '#60a5fa',
                  color: 'var(--text-primary)',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                <Search style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                Analyze Path
              </button>
              <button
                type="button"
                style={{
                  flex: 1,
                  borderRadius: '12px',
                  border: '1px solid var(--border-input)',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Re-Link Identity
              </button>
            </section> */}
          </div>
        )}
      </DiagnosticDrawer>
    </>
  );
}





