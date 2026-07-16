"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../../../../context/AuthContext";
import { PageRestricted } from "../../../../components/PageRestricted";
import { PageHero } from "../../../../components/PageHero";
import { useConnectorFilter } from "../../../../hooks/useConnectorFilter";
import { useParams } from "next/navigation";
import { DiagnosticDrawer } from "@kpi-platform/ui";
import { canAccessRoute, normalizeRole } from "@kpi-platform/shared-types";
import {
  Package,
  Clock,
  AlertTriangle,
  ShoppingBag,
  Activity,
  Search,
  ChevronRight,
  RefreshCw,
  Building2,
  FileText,
  AlertCircle,
  CheckCircle2,
  Truck,
  PieChart as PieChartIcon,
  BarChart3,
} from "lucide-react";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { OrderDetailDrawerContent } from "../../../../components/orders/OrderDetailDrawerContent";
import { RevenueStrip, computeWindowRange, type TimeWindow } from "../../../../components/orders/RevenueStrip";

// Accent palette — mid-tone, saturated hues legible on BOTH light and dark themes.
const ACCENT = {
  indigo: "#6366f1",
  sky: "#0ea5e9",
  emerald: "#10b981",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  rose: "#f43f5e",
  slate: "#94a3b8",
};

// Status → color, so the donut and any badges read consistently.
const STATUS_COLOR: Record<string, string> = {
  paid: ACCENT.emerald,
  delivered: "#22c55e",
  shipped: ACCENT.sky,
  placed: ACCENT.indigo,
  processing: ACCENT.amber,
  pending: ACCENT.amber,
  cancelled: ACCENT.rose,
  canceled: ACCENT.rose,
  failed: ACCENT.rose,
  returned: ACCENT.violet,
  refunded: ACCENT.violet,
  unknown: ACCENT.slate,
};
const colorForStatus = (status: string) =>
  STATUS_COLOR[String(status || "").toLowerCase()] || ACCENT.slate;

const HEALTH_COLOR: Record<string, string> = {
  healthy: ACCENT.emerald,
  delayed: ACCENT.amber,
  failed: ACCENT.rose,
};

// Shared recharts tooltip styling, theme-aware via CSS vars.
const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-card)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "var(--text-primary)",
};

const pad2 = (value: number) => String(value).padStart(2, "0");

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

const pageStyle: React.CSSProperties = {
  paddingTop: "24px",
  paddingRight: "28px",
  paddingBottom: "24px",
  paddingLeft: "28px",
  maxWidth: "1280px",
  margin: "0 auto",
  display: "block",
  overflow: "visible",
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  overflow: "visible",
};

const cardStyle: React.CSSProperties = {
  borderRadius: "12px",
  border: "1px solid var(--border-card)",
  background: "var(--bg-card)",
  padding: "24px",
  overflow: "visible",
};

const ORDERS_PAGE_SIZE = 50;
const ORDERS_FETCH_LIMIT = 10000;

const normalizeLookupValue = (value?: string | null) => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const collectLookupValues = (...values: any[]) =>
  values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => normalizeLookupValue(value))
    .filter(Boolean);

const getOrderMetadata = (order: any): any => {
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

const orderMatchesActiveConnector = (order: any, connectorInstanceId: string | null) => {
  if (!connectorInstanceId) return true;

  const metadata = getOrderMetadata(order);
  const connectorCandidates = collectLookupValues(
    order?.connectorInstanceId,
    order?.connectorId,
    order?.connectorLabel,
    order?.connectorInstanceLabel,
    order?.sourceSystem,
    order?.channel,
    metadata?.connectorInstanceId,
    metadata?.connectorId,
    metadata?.connectorLabel,
    metadata?.connectorInstanceLabel,
    metadata?.sourceSystem,
    metadata?.source,
    metadata?.platform,
  );

  return connectorCandidates.includes(normalizeLookupValue(connectorInstanceId));
};

const buildOrderStats = (orders: any[]) => {
  const now = Date.now();
  const thisHour = orders.filter((order) => now - Number(new Date(order.placedAt || order.createdAt || 0)) < 60 * 60 * 1000);

  const onlineSplit = orders.filter((order) => {
    const source = String(order?.source || order?.sourceSystem || order?.channel || order?.orderSource || "").toLowerCase();
    return source.includes("shopify") || source.includes("online") || source.includes("bigcommerce");
  }).length;

  const offlineSplit = orders.length - onlineSplit;

  const delayedCount = orders.filter((order) => {
    const status = String(order?.status || order?.lifecycleState || order?.normalizedStatus || "").toLowerCase();
    return status === "pending" || status === "processing" || status === "placed";
  }).length;

  const failedCount = orders.filter((order) => {
    const status = String(order?.status || order?.lifecycleState || order?.normalizedStatus || "").toLowerCase();
    return status === "cancelled" || status === "canceled" || status === "failed" || status === "returned" || status === "refunded";
  }).length;

  return {
    totalOrders: orders.length,
    ordersThisHour: thisHour.length,
    onlineSplit,
    offlineSplit,
    delayedCount,
    failedCount,
    ordersPerMinute: (thisHour.length / 60).toFixed(2),
  };
};

const normalizeOrderRecord = (order: any) => {
  const lifecycleStatus = String(
    order?.lifecycleState || order?.status || order?.normalizedStatus || "unknown"
  ).toLowerCase();
  const amount = Number(order?.amount ?? order?.totalAmount ?? 0);
  const currency = String(order?.currency || "USD").toUpperCase();
  const reconciliationStatus = String(
    order?.syncStatus || (order?.metadata?.qualityWarnings?.length ? "mismatch" : "synced")
  ).toLowerCase();

  return {
    ...order,
    channel: String(order?.channel || order?.orderSource || order?.sourceSystem || "unknown").toLowerCase(),
    status: lifecycleStatus,
    health: String(
      order?.health ||
        (lifecycleStatus === "cancelled" || lifecycleStatus === "returned" || lifecycleStatus === "failed"
          ? "failed"
          : lifecycleStatus === "placed"
            ? "delayed"
            : "healthy")
    ).toLowerCase(),
    syncStatus: reconciliationStatus,
    amount,
    currency,
    externalOrderId:
      order?.externalOrderId ||
      order?.externalReferenceId ||
      order?.orderId ||
      order?.metadata?.orderNumber ||
      "",
    createdAt: order?.placedAt || order?.createdAt || new Date().toISOString(),
  };
};

// Render an age (in ms) as "1y 2mo 3d 4h 5m 6s", showing higher units only when
// non-zero and always including seconds. Years/months use 365/30-day approximations.
const formatAge = (ms: number) => {
  let s = Math.floor((Number.isFinite(ms) && ms > 0 ? ms : 0) / 1000);
  const years = Math.floor(s / (365 * 24 * 3600)); s -= years * 365 * 24 * 3600;
  const months = Math.floor(s / (30 * 24 * 3600)); s -= months * 30 * 24 * 3600;
  const days = Math.floor(s / (24 * 3600)); s -= days * 24 * 3600;
  const hours = Math.floor(s / 3600); s -= hours * 3600;
  const minutes = Math.floor(s / 60); s -= minutes * 60;
  const seconds = s;

  const parts: string[] = [];
  if (years) parts.push(`${years}y`);
  if (months) parts.push(`${months}mo`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
};

const formatOrderAmount = (order: any) => {
  const amount = Number(order?.amount ?? order?.totalAmount ?? 0);
  const currency = String(order?.currency || "USD").trim().toUpperCase();

  const formatNumericAmount = (value: number) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const currencySymbolMap: Record<string, string> = {
    USD: "$",
    AUD: "A$",
    INR: "₹",
  };

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const symbol = currencySymbolMap[currency];
    if (symbol) {
      return `${symbol}${formatNumericAmount(amount)}`;
    }

    return `${currency} ${formatNumericAmount(amount)}`;
  }
};

export default function OrdersPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch, user } = useAuth();
  const { connectorInstanceId, connectorSelectionTick } = useConnectorFilter();
  const tenantId = user?.tenantId;
  const normalizedRole = normalizeRole(user?.role);
  const canAccessOrders = canAccessRoute(normalizedRole, 'orders');

  const [loading, setLoading] = useState(true);
  const lastFetchTimeRef = useRef(0);
  const [stats, setStats] = useState<any>({
    totalOrders: 0,
    ordersThisHour: 0,
    onlineSplit: 0,
    offlineSplit: 0,
    delayedCount: 0,
    failedCount: 0,
    ordersPerMinute: "0.00",
  });
  const [orders, setOrders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  // Lifted time window — shared by the revenue strip and the order table below.
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const drawerWidth = '700px';

  const fetchData = useCallback(async (force = false) => {
    if (!token || !projectId) return;
    if (!canAccessOrders) return;
    
    // Debounce: prevent fetching more than once per 2 seconds using ref (not state)
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < 2000) {
      return;
    }
    lastFetchTimeRef.current = now;
    
    setLoading(true);
    setError(null);
    try {
      // Use Promise.all to fetch summary and list in parallel; avoid excessive sequential calls
      const [, listRes] = await Promise.all([
        apiFetch(`/api/v1/dashboard/orders/summary?siteId=${projectId}`),
        apiFetch(`/api/v1/dashboard/orders/list?siteId=${projectId}&limit=${ORDERS_FETCH_LIMIT}&offset=0`),
      ]);

      const oList = listRes;

      // Fetch only first page and paginate client-side to avoid rate limiting
      const pageOrders = Array.isArray(oList) ? oList : [];
      const scopedOrders = pageOrders.filter((order) => orderMatchesActiveConnector(order, connectorInstanceId));
      console.debug('[OrdersPage] Fetched orders:', pageOrders.length, 'orders', 'Scoped orders:', scopedOrders.length, 'connector:', connectorInstanceId || 'none');
      const normalizedOrders = scopedOrders.map(normalizeOrderRecord);
      setOrders(normalizedOrders);
      setStats(buildOrderStats(normalizedOrders));
      setLastUpdated(new Date());
    } catch (e) {
      console.error("Failed to sync order intelligence:", e);
      setError("Failed to synchronize order intelligence. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [projectId, token, apiFetch, connectorInstanceId, canAccessOrders]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (!token || !projectId) return;
    lastFetchTimeRef.current = 0;
    setLoading(true);
    setError(null);
    setOrders([]);
    setStats({
      totalOrders: 0,
      ordersThisHour: 0,
      onlineSplit: 0,
      offlineSplit: 0,
      delayedCount: 0,
      failedCount: 0,
      ordersPerMinute: '0.00',
    });
    fetchData(true);
  }, [connectorSelectionTick, projectId, token, fetchData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [projectId]);

  const handleInspect = (order: any) => {
    setSelectedOrder(normalizeOrderRecord(order));
    setIsDrawerOpen(true);
  };

  const handleAction = async (action: string) => {
    console.log(`Action triggered for ${selectedOrder?.id}: ${action}`);
  };

  // Time-window scope shared by the revenue strip and the table.
  const windowedOrders = useMemo(() => {
    const { start, end } = computeWindowRange(timeWindow, customFrom, customTo);
    return orders.filter((o) => {
      const ts = Number(new Date(o.placedAt || o.createdAt || 0));
      return Number.isFinite(ts) && ts >= start && ts <= end;
    });
  }, [orders, timeWindow, customFrom, customTo]);

  // Chart-ready aggregates for the current time window: a volume/revenue trend,
  // status distribution, and fulfillment-health split. Recomputed only when the
  // windowed order set changes.
  const orderAnalytics = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const healthCounts: Record<string, number> = {};
    const currencyCounts: Record<string, number> = {};
    let minTs = Infinity;
    let maxTs = -Infinity;

    for (const order of windowedOrders) {
      const ts = Number(new Date(order.placedAt || order.createdAt || 0));
      if (Number.isFinite(ts) && ts > 0) {
        minTs = Math.min(minTs, ts);
        maxTs = Math.max(maxTs, ts);
      }
      const status = String(order.status || "unknown").toLowerCase();
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      const health = String(order.health || "unknown").toLowerCase();
      healthCounts[health] = (healthCounts[health] || 0) + 1;
      const currency = String(order.currency || "USD").toUpperCase();
      currencyCounts[currency] = (currencyCounts[currency] || 0) + 1;
    }

    // Bucket the trend by day for short windows, by month for long ones, so the
    // x-axis never collapses into an unreadable smear.
    const span =
      Number.isFinite(minTs) && Number.isFinite(maxTs) ? maxTs - minTs : 0;
    const monthly = span > 62 * 24 * 60 * 60 * 1000;
    const trendMap = new Map<
      string,
      { key: string; label: string; orders: number; revenue: number }
    >();
    for (const order of windowedOrders) {
      const date = new Date(order.placedAt || order.createdAt || 0);
      if (Number.isNaN(date.getTime())) continue;
      const key = monthly
        ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
        : `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
      let bucket = trendMap.get(key);
      if (!bucket) {
        bucket = {
          key,
          label: date.toLocaleDateString(
            "en-US",
            monthly
              ? { month: "short", year: "numeric" }
              : { month: "short", day: "numeric" },
          ),
          orders: 0,
          revenue: 0,
        };
        trendMap.set(key, bucket);
      }
      bucket.orders += 1;
      bucket.revenue += Number(order.amount ?? order.totalAmount ?? 0) || 0;
    }

    const trend = Array.from(trendMap.values())
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map(({ label, orders, revenue }) => ({
        label,
        orders,
        revenue: Math.round(revenue),
      }));

    const dominantCurrency =
      Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "USD";

    const statusData = Object.entries(statusCounts)
      .map(([name, count]) => ({ name, count, color: colorForStatus(name) }))
      .sort((a, b) => b.count - a.count);

    const total = windowedOrders.length;
    const healthOrder = ["healthy", "delayed", "failed"];
    const healthData = healthOrder
      .map((name) => ({
        name,
        count: healthCounts[name] || 0,
        color: HEALTH_COLOR[name],
        percent: total === 0 ? 0 : Math.round(((healthCounts[name] || 0) / total) * 100),
      }))
      .filter((row) => row.count > 0);

    return { trend, statusData, healthData, dominantCurrency, total };
  }, [windowedOrders]);

  const filteredOrders = useMemo(() => {
    return windowedOrders.filter((o) => {
      const id = String(o.id || "").toLowerCase();
      const externalId = String(o.externalOrderId || "").toLowerCase();
      const query = searchQuery.toLowerCase();
      const matchesSearch = id.includes(query) || externalId.includes(query);
      const matchesStatus = !filterStatus || o.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [windowedOrders, searchQuery, filterStatus]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE));
  }, [filteredOrders.length]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const visibleOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * ORDERS_PAGE_SIZE;
    return filteredOrders.slice(startIndex, startIndex + ORDERS_PAGE_SIZE);
  }, [currentPage, filteredOrders]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, timeWindow, customFrom, customTo]);

  const isPageRestricted = !canAccessOrders;

  const timeline = useMemo<any[]>(() => {
    if (!selectedOrder) return [];
    const events: any[] = [
      {
        title: "Order Placed",
        time: "Captured",
        system: selectedOrder.channel?.toUpperCase() || "SOURCE",
        type: "success",
      },
    ];
    if (["paid", "shipped", "delivered"].includes(selectedOrder.status)) {
      events.push({
        title: "Payment Validated",
        time: "Processed",
        system: "GATEWAY",
        type: "success",
      });
    }
    if (selectedOrder.syncStatus === "error") {
      events.push({
        title: "Sync Failure",
        time: "Recent",
        system: "OMS-1",
        type: "error",
        description: "Internal processing error during synchronization.",
      });
    } else if (selectedOrder.syncStatus === "synced") {
      events.push({
        title: "Unified State Sync",
        time: "Success",
        system: "CORE",
        type: "success",
      });
    }
    return events.reverse();
  }, [selectedOrder]);

  const reconciliation = useMemo(() => {
    if (!selectedOrder) return [];
    const amountLabel = formatOrderAmount(selectedOrder);
    return [
      {
        name: "Storefront State",
        id: "SOURCE_API",
        value: amountLabel,
        match: true,
        icon: <ShoppingBag size={14} />,
      },
      {
        name: "OMS State",
        id: "INTEGRATION_LAYER",
        value: amountLabel,
        match: selectedOrder.syncStatus !== "mismatch",
        icon: <Building2 size={14} />,
      },
      {
        name: "Financial Ledger",
        id: "ERP_CORE",
        value: amountLabel,
        match: true,
        icon: <RefreshCw size={14} />,
      },
    ];
  }, [selectedOrder]);

  const statusColor = (status: string) => {
    switch ((status || "").toLowerCase()) {
      case "shipped":
      case "delivered":
      case "paid":
        return { bg: "var(--success-bg)", text: "var(--success-text)" };
      case "placed":
      case "processing":
        return { bg: "var(--info-bg)", text: "var(--info-text)" };
      case "cancelled":
      case "failed":
        return { bg: "var(--error-bg)", text: "var(--error-text)" };
      default:
        return { bg: "var(--bg-badge-active)", text: "var(--text-muted)" };
    }
  };

  const healthColor = (health: string) => {
    if (health === "healthy")
      return { bg: "var(--success-bg)", text: "var(--success-text)" };
    if (health === "delayed")
      return { bg: "var(--warning-bg)", text: "var(--warning-text)" };
    return { bg: "var(--error-bg)", text: "var(--error-text)" };
  };

  if (isPageRestricted) {
    return <PageRestricted pageKey="orders" />;
  }

  if (loading && orders.length === 0) {
    return (
      <div
        style={{
          ...pageStyle,
          ...sectionStyle,
          minHeight: "100vh",
          background: "var(--bg-page)",
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "9999px",
              border: "4px solid #1f2937",
              borderTopColor: "#3b82f6",
              marginBottom: "16px",
              animation: "spin 1s linear infinite",
            }}
          />
          <span
            style={{
              fontSize: "10px",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
            }}
          >
            Loading Order Console…
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Interaction polish: hover lift on metric cards. Theme-neutral shadow. */}
      <style>{`
        .ord-metric-card {
          transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
        }
        .ord-metric-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(99, 102, 241, 0.16);
          border-color: rgba(99, 102, 241, 0.4);
        }
      `}</style>
      <div
        style={{
          ...pageStyle,
          ...sectionStyle,
          boxSizing: 'border-box',
          width: '100%',
          paddingRight: isDrawerOpen ? drawerWidth : pageStyle.paddingRight,
          minHeight: "100vh",
          background: "var(--bg-page)",
          color: "var(--text-primary)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <PageHero
            icon={Package}
            accent="#60a5fa"
            eyebrow="Order Operations"
            title="Order Operations Console"
            subtitle="Real-time oversight and intelligence for high-volume order flows."
            live
          />

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "12px",
            }}
          >
            {/* <button
              onClick={fetchData}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                borderRadius: "8px",
                border: "1px solid var(--border-input)",
                background: "var(--bg-input)",
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 500,
                color: "var(--text-primary)",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <RefreshCw
                style={{
                  width: "16px",
                  height: "16px",
                  flexShrink: 0,
                  animation: loading ? "spin 1s linear infinite" : undefined,
                }}
              />{" "}
              Refresh
            </button> */}
          </div>
        </div>

        {error && (
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(244,63,94,0.2)",
              background: "rgba(244,63,94,0.1)",
              color: "#fb7185",
              overflow: "visible",
            }}
          >
            <div
              style={{
                display: "flex",
                minWidth: 0,
                alignItems: "center",
                gap: "12px",
              }}
            >
              <AlertCircle
                style={{ width: "16px", height: "16px", flexShrink: 0 }}
              />
              <span style={{ fontSize: "14px", overflowWrap: "anywhere" }}>
                {error}
              </span>
            </div>
            <button
              onClick={() => fetchData(true)}
              style={{
                marginLeft: "8px",
                flexShrink: 0,
                fontSize: "14px",
                fontWeight: 500,
                textDecoration: "underline",
                color: "#fb7185",
                cursor: "pointer",
                background: "transparent",
                border: "none",
              }}
            >
              Retry
            </button>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "24px",
            overflow: "visible",
          }}
        >
          {[
            {
              label: "Total Orders",
              value: stats.totalOrders ?? 0,
              status: "LIVE",
              context: "Across channels",
              icon: ShoppingBag,
              statusBg: "var(--success-bg)",
              statusColor: "var(--success-text)",
              accent: ACCENT.indigo,
            },
            {
              label: "Orders This Hour",
              value: stats.ordersThisHour ?? 0,
              status: "FLOW",
              context: "Current hour throughput",
              icon: Activity,
              statusBg: "var(--info-bg)",
              statusColor: "var(--info-text)",
              accent: ACCENT.sky,
            },
            {
              label: "Delayed Orders",
              value: stats.delayedCount ?? 0,
              status: "SLA",
              context: "Potential breach",
              icon: Clock,
              statusBg: "var(--warning-bg)",
              statusColor: "var(--warning-text)",
              accent: ACCENT.amber,
            },
            {
              label: "Critical Failures",
              value: stats.failedCount ?? 0,
              status: "ALERT",
              context: "Immediate review",
              icon: AlertTriangle,
              statusBg: "var(--error-bg)",
              statusColor: "var(--error-text)",
              accent: ACCENT.rose,
            },
          ].map((metric) => (
            <div
              key={metric.label}
              className="ord-metric-card"
              style={{
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
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "var(--text-muted)",
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {metric.label}
                </span>
                <span
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    // ~14% tint of the accent reads on light and dark alike.
                    background: `${metric.accent}24`,
                    flexShrink: 0,
                  }}
                >
                  <metric.icon
                    style={{
                      width: "16px",
                      height: "16px",
                      flexShrink: 0,
                      color: metric.accent,
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
                  overflow: "visible",
                }}
              >
                {metric.value}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "12px",
                }}
              >
                <span
                  style={{
                    padding: "3px 10px",
                    borderRadius: "999px",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    background: metric.statusBg,
                    color: metric.statusColor,
                  }}
                >
                  {metric.status}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--text-label)",
                    marginLeft: "8px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                >
                  {metric.context}
                </span>
              </div>
            </div>
          ))}
        </div>

        <RevenueStrip
          orders={windowedOrders}
          timeWindow={timeWindow}
          onWindowChange={setTimeWindow}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFrom={setCustomFrom}
          onCustomTo={setCustomTo}
          lastUpdated={lastUpdated}
        />

        {/* Order Volume & Revenue trend — bars = order count, line = revenue. */}
        <div style={cardStyle}>
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
            Order Volume & Revenue
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
            {orderAnalytics.total.toLocaleString()} orders · selected window
          </span>

          <div style={{ width: "100%", height: 300, marginTop: "20px" }}>
            {orderAnalytics.trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={orderAnalytics.trend}
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
                        orderAnalytics.dominantCurrency,
                      )
                    }
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: any, name: any) =>
                      name === "Revenue"
                        ? formatCompactCurrency(
                            Number(value),
                            orderAnalytics.dominantCurrency,
                          )
                        : Number(value).toLocaleString()
                    }
                  />
                  <Legend iconType="circle" />
                  <Bar
                    yAxisId="left"
                    dataKey="orders"
                    name="Orders"
                    fill={ACCENT.indigo}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={ACCENT.emerald}
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
                  ? "Loading order trend…"
                  : "No orders in the selected window to chart."}
              </div>
            )}
          </div>
        </div>

        {/* Status distribution (donut) + fulfillment health (bars). */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
            overflow: "visible",
          }}
        >
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-primary)",
                marginBottom: "16px",
              }}
            >
              <PieChartIcon
                style={{ width: "15px", height: "15px", color: ACCENT.indigo }}
              />
              Order Status Distribution
            </div>

            {orderAnalytics.statusData.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "20px",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    width: "150px",
                    height: "150px",
                    flexShrink: 0,
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={orderAnalytics.statusData}
                        dataKey="count"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={70}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {orderAnalytics.statusData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: any, _name: any, entry: any) => [
                          `${Number(value).toLocaleString()} orders`,
                          String(entry?.payload?.name || "").toUpperCase(),
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
                        fontSize: "22px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        lineHeight: 1,
                      }}
                    >
                      {orderAnalytics.total.toLocaleString()}
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
                      Orders
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    minWidth: "140px",
                  }}
                >
                  {orderAnalytics.statusData.map((entry) => (
                    <div
                      key={entry.name}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "13px",
                          color: "var(--text-primary)",
                          textTransform: "capitalize",
                        }}
                      >
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: entry.color,
                            flexShrink: 0,
                          }}
                        />
                        {entry.name}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.count.toLocaleString()} ·{" "}
                        {orderAnalytics.total === 0
                          ? 0
                          : Math.round(
                              (entry.count / orderAnalytics.total) * 100,
                            )}
                        %
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--text-muted)",
                  padding: "24px 0",
                }}
              >
                {loading
                  ? "Loading status mix…"
                  : "No orders in the selected window."}
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-primary)",
                marginBottom: "16px",
              }}
            >
              <BarChart3
                style={{ width: "15px", height: "15px", color: ACCENT.emerald }}
              />
              Fulfillment Health
            </div>

            {orderAnalytics.healthData.length > 0 ? (
              <>
                <div style={{ width: "100%", height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={orderAnalytics.healthData}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                      barCategoryGap={16}
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
                        width={84}
                        tickLine={false}
                        axisLine={false}
                        stroke="var(--text-muted)"
                        fontSize={12}
                        tickFormatter={(value) =>
                          String(value).charAt(0).toUpperCase() +
                          String(value).slice(1)
                        }
                      />
                      <Tooltip
                        cursor={{ fill: "var(--bg-input)" }}
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(value: any, _name: any, entry: any) => [
                          `${Number(value).toLocaleString()} · ${entry?.payload?.percent ?? 0}%`,
                          String(entry?.payload?.name || "").toUpperCase(),
                        ]}
                      />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={26}>
                        {orderAnalytics.healthData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
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
                  {orderAnalytics.healthData.map((entry) => (
                    <span
                      key={entry.name}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        textTransform: "capitalize",
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "2px",
                          background: entry.color,
                          flexShrink: 0,
                        }}
                      />
                      {entry.name}
                      <span style={{ color: "var(--text-muted)" }}>
                        {entry.count.toLocaleString()} · {entry.percent}%
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
                  padding: "24px 0",
                }}
              >
                {loading
                  ? "Loading fulfillment health…"
                  : "No orders in the selected window."}
              </div>
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto auto",
              gap: "12px",
              alignItems: "center",
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
                placeholder="Search Order ID, Marketplace ID, or Customer..."
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
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
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
              <option value="">All Statuses</option>
              <option value="placed">Placed</option>
              <option value="processing">Processing</option>
              <option value="paid">Paid</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
              <option value="failed">Failed</option>
            </select>
            <button
              onClick={() => {
                setFilterStatus("");
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
              <Truck style={{ width: "16px", height: "16px", flexShrink: 0 }} />
              Page {currentPage} of {totalPages} · {filteredOrders.length} matching
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: "0" }}>
          {filteredOrders.length === 0 ? (
            <div
              style={{
                minHeight: "280px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                textAlign: "center",
              }}
            >
              <CheckCircle2
                style={{
                  width: "40px",
                  height: "40px",
                  color: "#10b981",
                  marginBottom: "12px",
                }}
              />
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: "8px",
                }}
              >
                No Orders Matched
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                Adjust search or status filters to broaden results.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "1.3fr 0.7fr 0.8fr 0.8fr 0.9fr 0.7fr 1.2fr",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border-card)",
                  color: "var(--text-muted)",
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontWeight: 700,
                }}
              >
                <span>Order ID</span>
                <span>Channel</span>
                <span>Status</span>
                <span>Health</span>
                <span>Reconciliation</span>
                <span style={{ textAlign: "right" }}>Value</span>
                <span style={{ textAlign: "right" }}>Age</span>
              </div>
              {visibleOrders.map((o) => {
                const status = statusColor(o.status || "");
                const health = healthColor(o.health || "");
                const syncError = o.syncStatus !== "synced";
                // Age is measured from canonical_order.placed_at (online + offline/CSV alike).
                const ageBasis = o.placedAt || o.createdAt;
                const ageMs = ageBasis ? Date.now() - new Date(ageBasis).getTime() : 0;
                const diff = ageMs / 60000;

                return (
                  <button
                    key={o.id}
                    onClick={() => handleInspect(o)}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1.3fr 0.7fr 0.8fr 0.8fr 0.9fr 0.7fr 1.2fr",
                      alignItems: "center",
                      gap: "8px",
                      padding: "14px 16px",
                      borderBottom: "1px solid var(--border-card)",
                      background: "transparent",
                      color: "var(--text-primary)",
                      textAlign: "left",
                      cursor: "pointer",
                      borderLeft: "none",
                      borderRight: "none",
                      borderTop: "none",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {o.externalOrderId || o.orderId || o.externalReferenceId || o.metadata?.orderNumber || "-"}
                      </div>
                      <div
                        style={{
                          fontSize: "10px",
                          color: "var(--text-secondary)",
                          marginTop: "2px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {o.id ? `Record: ${o.id}` : ""}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        minWidth: 0,
                      }}
                    >
                      {(() => {
                        const ch = String(o.channel || "").toLowerCase();
                        const isOffline =
                          ch === "offline" ||
                          ch === "pos" ||
                          String(o.sourceSystem || "").toLowerCase() === "csv" ||
                          o.metadata?.orderSource === "offline";
                        if (isOffline) {
                          return (
                            <>
                              <FileText
                                style={{
                                  width: "14px",
                                  height: "14px",
                                  flexShrink: 0,
                                  color: "var(--text-muted)",
                                }}
                              />
                              <span
                                style={{
                                  fontSize: "11px",
                                  textTransform: "uppercase",
                                  fontWeight: 700,
                                  color: "var(--text-secondary)",
                                  background: "rgba(148,163,184,0.15)",
                                  border: "1px solid rgba(148,163,184,0.3)",
                                  borderRadius: "999px",
                                  padding: "2px 8px",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                OFFLINE
                              </span>
                            </>
                          );
                        }
                        const isOnline =
                          ch === "online" ||
                          ch === "web" ||
                          ch === "api" ||
                          ch.includes("shopify") ||
                          ch.includes("bigcommerce") ||
                          ch.includes("commerce");
                        return (
                          <>
                            <Activity
                              style={{
                                width: "14px",
                                height: "14px",
                                flexShrink: 0,
                                color: isOnline ? "#60a5fa" : "var(--text-muted)",
                              }}
                            />
                            <span
                              style={{
                                fontSize: "11px",
                                textTransform: "uppercase",
                                fontWeight: 700,
                                color: "var(--text-primary)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {isOnline ? "ONLINE" : o.channel || "unknown"}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "999px",
                        fontSize: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        whiteSpace: "nowrap",
                        background: status.bg,
                        color: status.text,
                        width: "fit-content",
                      }}
                    >
                      {String(o.status || "unknown").toUpperCase()}
                    </span>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "999px",
                        fontSize: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        whiteSpace: "nowrap",
                        background: health.bg,
                        color: health.text,
                        width: "fit-content",
                      }}
                    >
                      {String(o.health || "unknown").toUpperCase()}
                    </span>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: "999px",
                        fontSize: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        whiteSpace: "nowrap",
                        background: syncError
                          ? "var(--error-bg)"
                          : "var(--bg-badge-active)",
                        color: syncError
                          ? "var(--error-text)"
                          : "var(--text-muted)",
                        width: "fit-content",
                      }}
                    >
                      {String(o.syncStatus || "unknown").toUpperCase()}
                    </span>
                    <span
                      style={{
                        textAlign: "right",
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                      }}
                    >
                      {formatOrderAmount(o)}
                    </span>
                    <span
                      style={{
                        textAlign: "right",
                        fontSize: "11px",
                        fontWeight: diff > 60 ? 700 : 500,
                        color: diff > 60 ? "#f87171" : "var(--text-muted)",
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: "6px",
                      }}
                    >
                      <Clock
                        style={{ width: "14px", height: "14px", flexShrink: 0 }}
                      />
                      {formatAge(ageMs)}
                      <ChevronRight
                        style={{
                          width: "14px",
                          height: "14px",
                          flexShrink: 0,
                          color: "var(--text-secondary)",
                        }}
                      />
                    </span>
                  </button>
                );
              })}

              {filteredOrders.length > ORDERS_PAGE_SIZE && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "16px",
                    borderTop: "1px solid var(--border-card)",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Showing {(currentPage - 1) * ORDERS_PAGE_SIZE + 1}-{Math.min(currentPage * ORDERS_PAGE_SIZE, filteredOrders.length)} of {filteredOrders.length} orders
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      style={{
                        height: "36px",
                        padding: "0 12px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-card)",
                        background: "var(--bg-input)",
                        color: currentPage === 1 ? "var(--text-label)" : "var(--text-primary)",
                        cursor: currentPage === 1 ? "not-allowed" : "pointer",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      Prev
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
                      const pageNumber = index + 1;
                      return (
                        <button
                          key={pageNumber}
                          onClick={() => setCurrentPage(pageNumber)}
                          style={{
                            minWidth: "36px",
                            height: "36px",
                            padding: "0 10px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-card)",
                            background: currentPage === pageNumber ? "#dee3ee" : "var(--bg-input)",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                      style={{
                        height: "36px",
                        padding: "0 12px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-card)",
                        background: "var(--bg-input)",
                        color: currentPage === totalPages ? "var(--text-label)" : "var(--text-primary)",
                        cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <DiagnosticDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Order Details"
        subtitle={
          <>
            <span>Site: {projectId}</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: '999px',
                padding: '2px 8px',
                background: 'rgba(34, 197, 94, 0.14)',
                color: '#22c55e',
                fontSize: '11px',
                fontWeight: 400,
                lineHeight: 1,
              }}
            >
              Integrity · {selectedOrder?.health === 'healthy' ? 'Verified' : 'Review Required'}
            </span>
          </>
        }
        width={drawerWidth}
      >
        <OrderDetailDrawerContent
          order={selectedOrder}
          timeline={timeline}
          reconciliation={reconciliation}
          onAction={handleAction}
          role={user?.role}
        />
      </DiagnosticDrawer>
    </>
  );
}