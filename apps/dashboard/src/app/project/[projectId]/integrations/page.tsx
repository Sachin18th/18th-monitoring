"use client";
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import axios from "axios";
import { useAuth } from "../../../../context/AuthContext";
import { PageRestricted } from "../../../../components/PageRestricted";
import { useConnectorFilter } from "../../../../hooks/useConnectorFilter";
import { useParams } from "next/navigation";
import {
  FilterBar,
  DiagnosticDrawer,
  OperationalTable,
  Column,
} from "@kpi-platform/ui";
import {
  AlertCircle,
  ArrowRightLeft,
  Activity,
  RefreshCw,
  MoreHorizontal,
  Plus,
  Plug,
} from "lucide-react";
import { useToast } from "@kpi-platform/ui";
import { useConnectorPlatform } from "../../../../context/ConnectorPlatformContext";

// Integration specific components
import { IntegrationSummary } from "../../../../components/integrations/IntegrationSummary";
import {
  ConnectorCard,
  ConnectorHealth,
} from "../../../../components/integrations/ConnectorCard";
import { DiagnosticDrawerContent } from "../../../../components/integrations/DiagnosticDrawerContent";
import { SyncTrendChart } from "../../../../components/ui/SyncTrendChart";

const pageStyle: React.CSSProperties = {
  padding: "24px 28px",
  maxWidth: "1280px",
  margin: "0 auto",
  display: "block",
  overflow: "visible",
};

const sectionSpacingStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "24px",
  overflow: "visible",
};

const panelStyle: React.CSSProperties = {
  borderRadius: "12px",
  border: "1px solid var(--border-card)",
  background: "var(--bg-card)",
  padding: "24px",
  overflow: "visible",
};

const actionButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 16px",
  borderRadius: "8px",
  border: "1px solid var(--border-input)",
  background: "var(--bg-input)",
  color: "var(--text-primary)",
  fontSize: "14px",
  fontWeight: 500,
  cursor: "pointer",
};

const secondaryActionButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
};

const primaryActionButtonStyle: React.CSSProperties = {
  ...actionButtonStyle,
  border: "none",
  background: "#2563EB",
  color: "#fff",
};

const errorBannerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  borderRadius: "8px",
  border: "1px solid rgba(244,63,94,0.2)",
  background: "rgba(244,63,94,0.1)",
  padding: "12px 16px",
  color: "#fb7185",
};

export default function IntegrationsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { token, apiFetch } = useAuth();
  const { connectorInstanceId, setConnectorInstanceId } = useConnectorFilter();
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  // State
  const [loading, setLoading] = useState(true);
  const [integrationRecords, setIntegrationRecords] = useState<any[]>([]);
  const [summaryRecord, setSummaryRecord] = useState<any>({});
  const [trendRecords, setTrendRecords] = useState<any[]>([]);
  const [failedSyncRecords, setFailedSyncRecords] = useState<any[]>([]);
  const [allowedPageKeys, setAllowedPageKeys] = useState<string[] | null>(null);

  // UI State
  const [selectedConnector, setSelectedConnector] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [resyncDialog, setResyncDialog] = useState<{
    connector: any;
    phase: "confirm" | "running";
    error?: string | null;
  } | null>(null);
  const [resyncJobs, setResyncJobs] = useState<
    Record<string, { jobId: string; status: string; error?: string | null }>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const { openConnectorSetupModal } = useConnectorPlatform();
  const { success, error: showError } = useToast();
  const resyncPollersRef = useRef<Record<string, number>>({});

  const toText = (value: unknown, fallback = ""): string => {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return fallback;
    return String(value);
  };

  const toNumber = (value: unknown, fallback = 0): number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const resolveConnectorInstanceId = (connector: any): string => {
    return toText(
      connector?.id ||
        connector?.connectorId ||
        connector?.connectorInstanceId ||
        connector?.instanceId ||
        connector?.activeResyncJob?.connectorInstanceId ||
        connector?.activeResyncJob?.connectorId,
      "",
    ).trim();
  };

  const normalizeLookupKey = (value: unknown): string =>
    toText(value).trim().toLowerCase();

  const normalizeProviderLabel = (value: unknown): string => {
    const normalized = normalizeLookupKey(value);
    if (normalized === "adobe_commerce") return "Adobe Commerce";
    if (normalized === "bigcommerce") return "BigCommerce";
    if (normalized === "shopify") return "Shopify";
    if (normalized === "csv") return "CSV Upload";
    return toText(value);
  };

  const realtimeFetch = useCallback(
    async (url: string, includeConnectorInstanceId = false) => {
      const activeToken = token || localStorage.getItem("session-token");
      const scopedUrl = includeConnectorInstanceId
        ? `${url}${url.includes("?") ? "&" : "?"}connector_instance_id=${encodeURIComponent(connectorInstanceId || "")}`
        : url;
      const response = await axios.get(`${API_BASE}${scopedUrl}`, {
        headers: {
          Authorization: activeToken ? `Bearer ${activeToken}` : "",
          "session-token": activeToken || "",
        },
        timeout: 10000,
      });

      if (response.data && typeof response.data === "object" && "success" in response.data) {
        return response.data.data;
      }

      return response.data;
    },
    [API_BASE, connectorInstanceId, token],
  );

  const loadData = useCallback(async () => {
    if (!token || !projectId) return;
    setLoading(true);
    try {
      const permissions = await apiFetch(`/api/v1/user/permissions?projectId=${projectId}`, { suppressUnauthorizedRedirect: true });
      const nextAllowedPageKeys = Array.isArray(permissions?.allowedPageKeys) ? permissions.allowedPageKeys.map((v: any) => String(v)) : [];
      setAllowedPageKeys(nextAllowedPageKeys);

      if (!nextAllowedPageKeys.includes('integrations')) return;

      const response = await apiFetch(`/api/v1/tenants/current/projects/${projectId}/integrations`, {
        suppressUnauthorizedRedirect: true,
      });
      const integrations = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : [];

      const [summ, trend, failed] = await Promise.all([
        apiFetch(`/api/v1/dashboard/integrations/summary?siteId=${projectId}`, { suppressUnauthorizedRedirect: true }),
        apiFetch(`/api/v1/dashboard/integrations/trends?siteId=${projectId}`, { suppressUnauthorizedRedirect: true }),
        apiFetch(`/api/v1/dashboard/integrations/failed?siteId=${projectId}`, { suppressUnauthorizedRedirect: true }),
      ]);

      const summaryData = summ?.data ?? summ ?? {};
      const trendData = trend?.data ?? trend ?? [];
      const failedData = failed?.data ?? failed ?? [];

      setIntegrationRecords(integrations);
      setSummaryRecord(summaryData);
      setTrendRecords(Array.isArray(trendData) ? trendData : []);
      setFailedSyncRecords(Array.isArray(failedData) ? failedData : []);
    } catch (err) {
      console.error("Failed to load integration metrics", err);
    } finally {
      setLoading(false);
    }
  }, [connectorInstanceId, projectId, realtimeFetch, token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When a store/connector is selected elsewhere in the app (via useConnectorFilter),
  // automatically show that connector's details. If the integration record is not
  // present in the list yet, fetch the single integration record.
  useEffect(() => {
    if (!connectorInstanceId) {
      setSelectedConnector(null);
      setIsDrawerOpen(false);
      return;
    }

    // Try to find the connector locally first
    const found = integrationRecords.find((ir: any) => {
      const id = resolveConnectorInstanceId(ir);
      return id && id === connectorInstanceId;
    });

    if (found) {
      setSelectedConnector(found);
      setIsDrawerOpen(false);
      return;
    }

    // If not found, fetch the single integration record using apiFetch
    (async () => {
      try {
        let integration: any = null;
        try {
          // Use direct axios call to avoid apiFetch adding extra query params
          const activeToken = token || localStorage.getItem("session-token");
          const url = `${API_BASE}/api/v1/tenants/current/projects/${encodeURIComponent(
            projectId,
          )}/integrations/${encodeURIComponent(connectorInstanceId || "")}`;
          const resp = await axios.get(url, {
            headers: {
              Authorization: activeToken ? `Bearer ${activeToken}` : "",
              "session-token": activeToken || "",
            },
            timeout: 10000,
          });

          integration = resp?.data ?? null;
        } catch (fetchErr: any) {
          const status = fetchErr?.response?.status ?? fetchErr?.status;
          if (status === 404) {
            console.warn(`Integration not found for connectorInstanceId=${connectorInstanceId}`);
            integration = null;
          } else {
            throw fetchErr;
          }
        }

        if (integration) {
          setSelectedConnector(integration);
          setIsDrawerOpen(true);
        } else {
          setSelectedConnector(null);
          setIsDrawerOpen(false);
        }
      } catch (err: any) {
        // Non-404 errors are logged defensively
        let idStr = "(none)";
        try {
          if (typeof connectorInstanceId === "string") idStr = connectorInstanceId;
          else idStr = JSON.stringify(connectorInstanceId);
        } catch (e) {
          idStr = "(unserializable)";
        }

        let errMsg: string;
        try {
          errMsg = err?.message ?? String(err);
        } catch (e) {
          errMsg = "(unserializable error)";
        }

        console.error(
          `Failed to load integration for connectorInstanceId=${idStr}: ${errMsg}`,
        );
        setSelectedConnector(null);
        setIsDrawerOpen(false);
      }
    })();
  }, [connectorInstanceId, integrationRecords, realtimeFetch, projectId]);

  useEffect(() => {
    return () => {
      Object.values(resyncPollersRef.current).forEach((pollerId) =>
        window.clearInterval(pollerId),
      );
      resyncPollersRef.current = {};
    };
  }, []);

  const handleInspect = (connector: any) => {
    setConnectorInstanceId(resolveConnectorInstanceId(connector) || null);
    setSelectedConnector(connector);
    setIsDrawerOpen(true);
  };

  const clearResyncPoller = useCallback((connectorId: string) => {
    const pollerId = resyncPollersRef.current[connectorId];
    if (pollerId) {
      window.clearInterval(pollerId);
      delete resyncPollersRef.current[connectorId];
    }
  }, []);

  const updateResyncJobState = useCallback(
    (
      connectorId: string,
      nextState: {
        jobId: string;
        status: string;
        error?: string | null;
      } | null,
    ) => {
      setResyncJobs((current) => {
        const next = { ...current };
        if (!nextState) {
          delete next[connectorId];
          return next;
        }
        next[connectorId] = nextState;
        return next;
      });
    },
    [],
  );

  const startResyncPolling = useCallback(
    (connector: any, jobId: string) => {
      const poll = async () => {
        try {
          const connectorInstanceId = resolveConnectorInstanceId(connector);
          if (!connectorInstanceId) {
            throw new Error(
              "Missing connector instance id for resync polling.",
            );
          }

          const response = await apiFetch(
            `/api/v1/tenants/current/projects/${projectId}/integrations/${connectorInstanceId}/resync/status?jobId=${jobId}`,
          );
          const statusPayload = response?.data ?? response;
          const status = String(statusPayload?.status || "").toLowerCase();
          const errorMessage = statusPayload?.error || null;

          updateResyncJobState(connectorInstanceId, {
            jobId,
            status,
            error: errorMessage,
          });

          if (status === "completed") {
            clearResyncPoller(connectorInstanceId);
            updateResyncJobState(connectorInstanceId, null);
            setResyncDialog(null);
            success(`Re-sync completed for ${connector.name}`);
            await loadData();
          } else if (status === "failed") {
            clearResyncPoller(connectorInstanceId);
            updateResyncJobState(connectorInstanceId, null);
            setResyncDialog(null);
            showError(
              `Re-sync failed: ${errorMessage || "Unknown error"}`,
              connector.name,
            );
            await loadData();
          }
        } catch (error: any) {
          console.error("[IntegrationsPage] Failed to poll re-sync status", {
            connectorId: resolveConnectorInstanceId(connector),
            jobId,
            error: error?.message || error,
          });

          setResyncDialog((current) =>
            resolveConnectorInstanceId(current?.connector) ===
            resolveConnectorInstanceId(connector)
              ? {
                  ...current,
                  phase: "running",
                  error:
                    "Waiting for the backend job to respond. Retrying automatically.",
                }
              : current,
          );
        }
      };

      const connectorInstanceId = resolveConnectorInstanceId(connector);
      if (!connectorInstanceId) {
        throw new Error("Missing connector instance id for resync polling.");
      }

      clearResyncPoller(connectorInstanceId);
      poll();
      resyncPollersRef.current[connectorInstanceId] = window.setInterval(
        poll,
        5000,
      );
      updateResyncJobState(connectorInstanceId, { jobId, status: "running" });
    },
    [
      apiFetch,
      clearResyncPoller,
      loadData,
      projectId,
      showError,
      success,
      updateResyncJobState,
    ],
  );

  const handleResyncConfirm = useCallback(async () => {
    if (!resyncDialog || resyncDialog.phase !== "confirm") return;

    const connector = resyncDialog.connector;
    const connectorInstanceId = resolveConnectorInstanceId(connector);
    if (!connectorInstanceId) {
      setResyncDialog({
        connector,
        phase: "confirm",
        error: "Missing connector instance id for this integration.",
      });
      return;
    }

    setResyncDialog({ connector, phase: "running", error: null });

    try {
      const response = await apiFetch(
        `/api/v1/tenants/current/projects/${projectId}/integrations/${connectorInstanceId}/resync`,
        {
          method: "POST",
          body: JSON.stringify({ syncTargets: ["orders", "customers"] }),
        },
      );

      const payload = response?.data ?? response;
      const jobId = payload?.jobId;

      if (!jobId) {
        throw new Error("Re-sync job was not created.");
      }

      setResyncDialog({ connector, phase: "running", error: null });
      updateResyncJobState(connectorInstanceId, { jobId, status: "queued" });
      startResyncPolling(connector, jobId);
    } catch (error: any) {
      const message = error?.message || "Failed to start re-sync.";
      setResyncDialog({ connector, phase: "confirm", error: message });
      showError(message, connector.name);
    }
  }, [
    apiFetch,
    projectId,
    resyncDialog,
    showError,
    startResyncPolling,
    updateResyncJobState,
  ]);

  const handleResyncCancel = useCallback(() => {
    if (resyncDialog?.phase === "running") {
      return;
    }

    setResyncDialog(null);
  }, [resyncDialog]);

  const handleAction = async (action: string) => {
    if (!selectedConnector) return;

    if (action === "resync") {
      try {
        await apiFetch(
          `/api/v1/tenants/current/projects/${projectId}/integrations/${selectedConnector.id}/sync`,
          {
            method: "POST",
          },
        );
        loadData();
      } catch (e) {
        console.error("Action failed", e);
      }
    }
  };

  const connectors = useMemo(() => {
    return integrationRecords.map((integration: any) => {
      const connectorInstanceId = resolveConnectorInstanceId(integration);
      const provider = normalizeProviderLabel(integration?.providerId);
      const healthStatus = normalizeLookupKey(integration?.healthStatus);
      const healthScore = toNumber(integration?.healthScore, 0);

      let status: ConnectorHealth = "stale";
      if (healthStatus === "healthy") status = "healthy";
      else if (healthStatus === "degraded") status = "degraded";
      else if (healthStatus === "critical" || healthStatus === "offline") status = "critical";
      else if (healthStatus === "stale") status = "stale";

      return {
        id: connectorInstanceId,
        connectorInstanceId,
        name:
          toText(integration?.label).trim() ||
          toText(integration?.providerId).trim() ||
          toText(integration?.id).trim(),
        provider,
        type: toText(integration?.family || integration?.category).trim(),
        status,
        healthScore,
        lastSync: integration?.lastSyncAt
          ? new Date(integration.lastSyncAt).toLocaleTimeString()
          : "—",
        lastWebhook: integration?.lastWebhookAt
          ? new Date(integration.lastWebhookAt).toLocaleTimeString()
          : "—",
        metrics: {
          syncSuccess: healthScore,
          webhookLatency:
            typeof summaryRecord?.avgOmsLatency === "number"
              ? `${summaryRecord.avgOmsLatency}ms`
              : "—",
          freshness: (status === "healthy"
            ? "fresh"
            : status === "degraded"
              ? "delayed"
              : "stale") as "fresh" | "delayed" | "stale",
        },
        dimensions: {
          connectivity: toText(integration?.status).toUpperCase() === "ACTIVE",
          auth: healthStatus !== "critical" && healthStatus !== "offline",
          sync: Boolean(integration?.lastAttemptAt || integration?.lastSyncAt),
          webhook: Boolean(integration?.lastWebhookAt),
        },
        recordsByType: integration?.recordsByType || {},
        activeResyncJob: integration?.activeResyncJob || null,
        endpoint: toText(integration?.providerId).trim() || "—",
      };
    });
  }, [
    integrationRecords,
    summaryRecord?.avgOmsLatency,
  ]);

  const filteredConnectors = useMemo(() => {
    return connectors.filter((c) => {
      // If a connectorInstanceId is selected globally, only show that connector
      if (connectorInstanceId) {
        return (
          toText(c?.connectorInstanceId).trim() === connectorInstanceId ||
          toText(c?.id).trim() === connectorInstanceId
        );
      }

      const normalizedName = toText(c?.name).toLowerCase();
      const normalizedProvider = toText(c?.provider).toLowerCase();
      const normalizedQuery = toText(searchQuery).toLowerCase();
      const matchesSearch =
        normalizedName.includes(normalizedQuery) ||
        normalizedProvider.includes(normalizedQuery);
      const matchesStatus = !filterStatus || c.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [connectors, searchQuery, filterStatus, connectorInstanceId]);

  const summary = useMemo(() => {
    const total = connectors.length;
    const healthy = connectors.filter((c: any) => c.status === "healthy").length;
    const degraded = connectors.filter((c: any) => c.status === "degraded").length;
    const critical = connectors.filter((c: any) => c.status === "critical").length;
    const stale = connectors.filter((c: any) => c.status === "stale").length;
    const derivedSuccessRate =
      total > 0 ? Math.round((healthy / total) * 100) : "—";

    return {
      total,
      healthy,
      degraded,
      critical,
      stale,
      successRate:
        typeof summaryRecord?.successRate === "number"
          ? summaryRecord.successRate
          : derivedSuccessRate,
      avgLatency:
        typeof summaryRecord?.avgOmsLatency === "number"
          ? summaryRecord.avgOmsLatency
          : "—",
    };
  }, [connectors, summaryRecord]);

  const trends = useMemo(() => {
    return Array.isArray(trendRecords) ? trendRecords : [];
  }, [trendRecords]);

  const failedSyncs = useMemo(() => {
    if (failedSyncRecords.length > 0) {
      return failedSyncRecords.map((record: any) => ({
        ...record,
        system:
          toText(record?.system).trim() ||
          toText(record?.provider).trim() ||
          toText(record?.id).trim(),
        timestamp:
          record?.timestamp && !Number.isNaN(new Date(record.timestamp).valueOf())
            ? record.timestamp
            : null,
      }));
    }

    return [];
  }, [connectors, failedSyncRecords]);

  useEffect(() => {
    connectors.forEach((connector: any) => {
      const activeJob = connector.activeResyncJob;
      if (activeJob?.jobId && !resyncPollersRef.current[connector.id]) {
        startResyncPolling(connector, activeJob.jobId);
      }
    });
  }, [connectors, startResyncPolling]);

  const failedColumns: Column<any>[] = [
    {
      key: "system",
      header: "System",
      render: (val) => <span className="font-bold">{val}</span>,
    },
    {
      key: "error",
      header: "Failure Reason",
      render: (val) => <span className="text-error font-medium">{val}</span>,
    },
    {
      key: "timestamp",
      header: "Time",
      render: (val) =>
        val && !Number.isNaN(new Date(val).valueOf())
          ? new Date(val).toLocaleString()
          : "No timestamp",
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: () => (
        <button className="p-1 hover:bg-muted rounded">
          <MoreHorizontal size={16} />
        </button>
      ),
    },
  ];

  if (allowedPageKeys !== null && !allowedPageKeys.includes('integrations')) {
    return <PageRestricted pageKey="integrations" />;
  }

  return (
    <>
      <div
        className="integrations-backend-theme"
        style={{
          ...pageStyle,
          ...sectionSpacingStyle,
          minHeight: "100vh",
          background: "var(--bg-page)",
          color: "var(--text-primary)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ maxWidth: "42rem", minWidth: 0 }}>
            <h1
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "4px",
                fontSize: "20px",
                lineHeight: 1.25,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              <ArrowRightLeft
                style={{
                  width: "20px",
                  height: "20px",
                  color: "#818cf8",
                  flexShrink: 0,
                }}
              />
              Integrations Command Center
            </h1>
            <p
              style={{
                marginBottom: "8px",
                fontSize: "14px",
                color: "var(--text-muted)",
                lineHeight: 1.6,
                overflowWrap: "anywhere",
              }}
            >
              Deep operational visibility and control over all connector health
              and activity.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "12px",
              marginBottom: "8px",
            }}
          >
            {/* <button onClick={loadData} style={actionButtonStyle}>
                            <RefreshCw style={{ width: '14px', height: '14px', animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Refresh
                        </button> */}
            <button style={secondaryActionButtonStyle}>Audit Log</button>
            <button style={primaryActionButtonStyle}>Rule Config</button>
            <button
              onClick={() => openConnectorSetupModal()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "8px",
                background: "#2563EB",
                color: "#fff",
                border: "none",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Plus style={{ width: "14px", height: "14px" }} />
              Connect Store
            </button>
          </div>
        </div>

        {/* 1. Global Integration Health Header */}
        <IntegrationSummary stats={summary} loading={loading} />

        {/* 2. Critical Alerts & Anomalies / Insights */}
        {summary.critical > 0 && (
          <div style={errorBannerStyle}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "999px",
                background: "rgba(244,63,94,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#f87171",
                flexShrink: 0,
              }}
            >
              <AlertCircle style={{ width: "20px", height: "20px" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "#fecdd3",
                  margin: 0,
                  marginBottom: "4px",
                }}
              >
                Critical System Failure Detected
              </p>
              <p style={{ fontSize: "12px", color: "#fda4af", margin: 0 }}>
                {summary.critical} connectors are currently offline or failing
                critical heartbeats.
              </p>
            </div>
            <span
              style={{
                padding: "3px 10px",
                borderRadius: "999px",
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                whiteSpace: "nowrap",
                background: "#450a0a",
                color: "#f87171",
                flexShrink: 0,
              }}
            >
              Action Required
            </span>
          </div>
        )}

        {/* 3. Unified Filter Bar */}
        <div style={panelStyle}>
          <FilterBar
            searchPlaceholder="Search system name or provider..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            filters={[
              {
                id: "status",
                label: "Status",
                value: filterStatus,
                options: [
                  { label: "Healthy", value: "healthy" },
                  { label: "Degraded", value: "degraded" },
                  { label: "Critical", value: "critical" },
                  { label: "Stale", value: "stale" },
                ],
              },
            ]}
            onFilterChange={(_, val) => setFilterStatus(val)}
            activeFilterCount={filterStatus ? 1 : 0}
            onClearFilters={() => {
              setFilterStatus("");
              setSearchQuery("");
            }}
          />
        </div>

        {/* 4. Connector Grid */}
        <section style={panelStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Activity
                style={{
                  width: "18px",
                  height: "18px",
                  color: "rgba(255,255,255,0.45)",
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                Connector Reliability Matrix
              </p>
            </div>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
              Showing {filteredConnectors.length} of {connectors.length} total
            </span>
          </div>

          {loading ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "24px",
              }}
            >
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: "256px",
                    borderRadius: "12px",
                    border: "1px solid var(--border-card)",
                    background: "var(--bg-card)",
                    animation: "pulse 1.4s ease-in-out infinite",
                  }}
                />
              ))}
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "24px",
              }}
            >
              {filteredConnectors.map((connector, index) => (
                <ConnectorCard
                  key={toText(
                    connector?.id,
                    `${toText(connector?.provider, "connector")}-${toText(connector?.name, "unnamed")}-${index}`,
                  )}
                  {...connector}
                  onInspect={() => handleInspect(connector)}
                  onResync={(connectorId) => {
                    const normalizedId = toText(
                      connectorId || resolveConnectorInstanceId(connector),
                      "",
                    ).trim();
                    setResyncDialog({
                      connector: {
                        ...connector,
                        id: normalizedId,
                        connectorInstanceId: normalizedId,
                      },
                      phase: "confirm",
                      error: null,
                    });
                  }}
                  isResyncDisabled={Boolean(
                    resyncJobs[resolveConnectorInstanceId(connector)] ||
                    connector.activeResyncJob,
                  )}
                  isResyncRunning={Boolean(
                    resyncJobs[resolveConnectorInstanceId(connector)] ||
                    connector.activeResyncJob,
                  )}
                />
              ))}
              {filteredConnectors.length === 0 && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      padding: "48px 24px",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "12px",
                        background: "var(--bg-secondary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Plug
                        style={{
                          width: "22px",
                          height: "22px",
                          color: "var(--text-muted)",
                        }}
                      />
                    </div>
                    <p style={{ fontSize: "15px", fontWeight: 500 }}>
                      No stores connected yet
                    </p>
                    <p
                      style={{
                        fontSize: "13px",
                        color: "var(--text-muted)",
                        textAlign: "center",
                        maxWidth: "300px",
                      }}
                    >
                      Connect your first Shopify, Adobe Commerce, or BigCommerce
                      store to begin monitoring.
                    </p>
                    <button
                      onClick={() => openConnectorSetupModal()}
                      style={{
                        padding: "8px 20px",
                        borderRadius: "8px",
                        background: "#2563EB",
                        color: "#fff",
                        border: "none",
                        fontSize: "13px",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      Connect your first store
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 5. Activity & Trends */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
            alignItems: "start",
            overflow: "visible",
          }}
        >
          {/* Sync Success Trend */}
          <div style={panelStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "16px",
              }}
            >
              <RefreshCw
                style={{
                  width: "18px",
                  height: "18px",
                  color: "rgba(255,255,255,0.45)",
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                Synchronization Confidence
              </p>
            </div>
            <SyncTrendChart
              data={trends}
              height={240}
              title="Synchronization Confidence"
            />
          </div>

          {/* Critical Failure Logs */}
          <div
            style={{
              ...panelStyle,
              padding: 0,
              overflow: "hidden",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                padding: "16px",
                borderBottom: "1px solid #e5e7eb",
                background: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <AlertCircle
                  style={{ width: "18px", height: "18px", color: "#f87171" }}
                />
                <p
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  Critical Failure Audit
                </p>
              </div>
              <span
                style={{
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  whiteSpace: "nowrap",
                  background: "#f70e0e59",
                  color: "#390d0d",
                }}
              >
                {failedSyncs.length} Errors
              </span>
            </div>
            {failedSyncs.length === 0 ? (
              <div
                style={{
                  minHeight: "220px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "32px 24px",
                  background: "#ffffff",
                }}
              >
                <div
                  style={{
                    maxWidth: "420px",
                    width: "100%",
                    textAlign: "center",
                    borderRadius: "16px",
                    border: "1px solid #e5e7eb",
                    background: "#ffffff",
                    padding: "36px 28px",
                    boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
                  }}
                >
                  <div
                    style={{
                      width: "52px",
                      height: "52px",
                      borderRadius: "14px",
                      margin: "0 auto 16px",
                      background: "rgba(129,140,248,0.1)",
                      border: "1px solid rgba(129,140,248,0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#a5b4fc",
                    }}
                  >
                    <AlertCircle style={{ width: "24px", height: "24px" }} />
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "18px",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    No critical failures
                  </p>
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: "13px",
                      lineHeight: 1.6,
                      color: "var(--text-muted)",
                    }}
                  >
                    There are no records available at this time.
                  </p>
                </div>
              </div>
            ) : (
              <OperationalTable
                columns={failedColumns}
                data={failedSyncs}
                isDense
              />
            )}
          </div>
        </div>
      </div>

      {resyncDialog && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(2,6,23,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm re-sync"
        >
          <div
            style={{
              width: "min(100%, 520px)",
              borderRadius: "16px",
              border: "1px solid var(--border-card)",
              background: "var(--bg-card)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
              padding: "24px",
            }}
          >
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  {resyncDialog.phase === "running"
                    ? "Re-Sync In Progress"
                    : "Confirm Re-Sync"}
                </p>
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "14px",
                    lineHeight: 1.6,
                    color: "var(--text-muted)",
                  }}
                >
                  {resyncDialog.phase === "running"
                    ? `Reloading data for ${resyncDialog.connector.name}. This dialog will stay open until the backend job finishes.`
                    : `This will re-sync all orders and customers from ${resyncDialog.connector.name}. This may take a few minutes.`}
                </p>
              </div>
              <div
                style={{
                  borderRadius: "12px",
                  border: "1px solid var(--border-input)",
                  background: "rgba(37,99,235,0.08)",
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                {/* <RefreshCw style={{ width: '18px', height: '18px', color: '#60a5fa', flexShrink: 0, animation: 'spin 1s linear infinite' }} /> */}

                {resyncDialog.phase === "running" && (
                  <RefreshCw
                    style={{
                      width: "18px",
                      height: "18px",
                      color: "#60a5fa",
                      flexShrink: 0,
                      animation: "spin 1s linear infinite",
                    }}
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    {resyncDialog.phase === "running"
                      ? "Refreshing sync status automatically"
                      : "A background job will be created and monitored live"}
                  </p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    {resyncJobs[resyncDialog.connector.id]?.status
                      ? `Current job status: ${resyncJobs[resyncDialog.connector.id].status}`
                      : "Waiting to start the job."}
                  </p>
                  {resyncDialog.error && (
                    <p
                      style={{
                        margin: "6px 0 0",
                        fontSize: "12px",
                        color: "#fca5a5",
                        lineHeight: 1.5,
                      }}
                    >
                      {resyncDialog.error}
                    </p>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  justifyContent: "flex-end",
                  marginTop: "8px",
                }}
              >
                {resyncDialog.phase === "confirm" ? (
                  <>
                    <button
                      type="button"
                      onClick={handleResyncCancel}
                      style={{
                        padding: "10px 16px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-input)",
                        background: "transparent",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleResyncConfirm}
                      style={{
                        padding: "10px 16px",
                        borderRadius: "10px",
                        border: "none",
                        background: "#2563EB",
                        color: "#fff",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Start Re-Sync
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled
                    style={{
                      padding: "10px 16px",
                      borderRadius: "10px",
                      border: "none",
                      background: "#1d4ed8",
                      color: "#fff",
                      cursor: "not-allowed",
                      fontWeight: 600,
                      opacity: 0.9,
                    }}
                  >
                    Re-Syncing...
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostic Side Panel */}
      <DiagnosticDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={selectedConnector?.name || "Connector Details"}
        subtitle={`${selectedConnector?.provider} • Last activity ${selectedConnector?.lastSync}`}
        width="520px"
      >
        <DiagnosticDrawerContent
          connector={selectedConnector}
          syncHistory={[
            selectedConnector?.lastSync && selectedConnector.lastSync !== "—"
              ? [
                  {
                    timestamp: new Date().toISOString(),
                    type: "Latest",
                    status:
                      selectedConnector.status === "healthy" ? "success" : "error",
                    records: Object.values(
                      selectedConnector.recordsByType || {},
                    ).reduce(
                      (sum: number, value: any) => sum + Number(value || 0),
                      0,
                    ),
                  },
                ]
              : []
          ]}
          webhookActivity={[]}
          onAction={handleAction}
        />
      </DiagnosticDrawer>

      <style jsx global>{`
        .integrations-backend-theme [class*="bg-slate-"],
        .integrations-backend-theme [class*="bg-muted"] {
          background-color: #111318 !important;
        }

        .integrations-backend-theme [class*="border-slate-"],
        .integrations-backend-theme [class*="border-subtle"] {
          border-color: rgba(255, 255, 255, 0.08) !important;
        }

        .integrations-backend-theme [class*="text-slate-"],
        .integrations-backend-theme [class*="text-text-muted"] {
          color: #94a3b8 !important;
        }

        .integrations-backend-theme [class*="text-indigo-"],
        .integrations-backend-theme [class*="bg-indigo-"] {
          color: #a5b4fc !important;
          background-color: rgba(79, 70, 229, 0.2) !important;
        }

        .integrations-backend-theme [class*="backdrop-blur"] {
          backdrop-filter: none !important;
        }
      `}</style>
    </>
  );
}