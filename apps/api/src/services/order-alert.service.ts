import { prisma } from "@kpi-platform/db";
import crypto from "crypto";

/**
 * OrderAlertService
 *
 * Derives operational alerts from the real order data (CanonicalOrder) and
 * persists them to the `Alert` table so the Alert Center renders live,
 * DB-backed signals instead of static/stale data.
 *
 * Conditions mirror the Orders console metric cards:
 *   - Delayed orders   (PLACED / PROCESSING / PENDING) -> severity "high"
 *   - Critical failures (CANCELLED / RETURNED / FAILED / ...) -> severity "critical"
 *   - No orders in the last hour (while orders exist)         -> severity "high"
 *
 * Alerts use deterministic ids so repeated syncs upsert instead of duplicating,
 * and any order-derived alert whose order no longer qualifies is auto-resolved.
 */
const DELAYED_STATUSES = new Set(["PLACED", "PROCESSING", "PENDING"]);
const FAILED_STATUSES = new Set([
  "CANCELLED",
  "CANCELED",
  "FAILED",
  "RETURNED",
  "REFUNDED",
  "DEAD_LETTERED",
  "REJECTED",
]);

const ORDER_ALERT_TYPES = ["ORDER_DELAYED", "ORDER_FAILED", "NO_RECENT_ORDERS"];
const ORDER_SCAN_LIMIT = 500;

const alertId = (siteId: string, key: string) =>
  crypto.createHash("md5").update(`${siteId}:${key}`).digest("hex");

const orderStatus = (order: any): string =>
  String(order?.lifecycleState || order?.normalizedStatus || "").toUpperCase();

export class OrderAlertService {
  /**
   * Recompute order-derived alerts for a project and persist them to the DB.
   * Returns the number of currently-active order alerts.
   */
  static async syncOrderAlerts(siteId: string, tenantId: string): Promise<number> {
    if (!siteId) return 0;

    // Resolve the real tenant from the project so the Alert FK is always valid
    // (route params may pass a placeholder like "current").
    const project = await prisma.project.findUnique({
      where: { id: siteId },
      select: { tenantId: true },
    });
    if (!project) return 0;
    const resolvedTenantId = project.tenantId || tenantId;

    const now = new Date();

    const orders = await prisma.canonicalOrder.findMany({
      where: { siteId },
      orderBy: { placedAt: "desc" },
      take: ORDER_SCAN_LIMIT,
      select: {
        id: true,
        orderId: true,
        lifecycleState: true,
        normalizedStatus: true,
        totalAmount: true,
        currency: true,
        placedAt: true,
        connectorInstanceId: true,
      },
    });

    const qualifyingIds: string[] = [];
    const upserts: Promise<any>[] = [];

    // Track per-store activity so we can flag any store with 0 orders this hour.
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const byConnector = new Map<string, { total: number; lastHour: number }>();

    const queueAlert = (params: {
      id: string;
      severity: string;
      alertType: string;
      message: string;
      connectorInstanceId?: string | null;
      correlationId?: string | null;
      context: Record<string, any>;
    }) => {
      qualifyingIds.push(params.id);
      upserts.push(
        prisma.alert.upsert({
          where: { id: params.id },
          create: {
            id: params.id,
            siteId,
            tenantId: resolvedTenantId,
            connectorInstanceId: params.connectorInstanceId ?? null,
            severity: params.severity,
            status: "TRIGGERED",
            module: "Orders",
            alertType: params.alertType,
            message: params.message,
            context: params.context,
            correlationId: params.correlationId ?? null,
            triggeredAt: now,
          },
          // Refresh the human-facing fields but never silently un-resolve an
          // alert an operator has already acknowledged/resolved.
          update: {
            severity: params.severity,
            message: params.message,
            context: params.context,
          },
        }),
      );
    };

    for (const order of orders) {
      // Tally per-store order activity (only stores we can attribute orders to).
      if (order.connectorInstanceId) {
        const bucket = byConnector.get(order.connectorInstanceId) || { total: 0, lastHour: 0 };
        bucket.total += 1;
        if (order.placedAt && new Date(order.placedAt) >= oneHourAgo) bucket.lastHour += 1;
        byConnector.set(order.connectorInstanceId, bucket);
      }

      const status = orderStatus(order);
      const currency = String(order.currency || "USD");
      const amount = Number(order.totalAmount || 0);
      const amountLabel = `${currency} ${amount.toFixed(2)}`;

      if (FAILED_STATUSES.has(status)) {
        queueAlert({
          id: alertId(siteId, `${order.id}:ORDER_FAILED`),
          severity: "critical",
          alertType: "ORDER_FAILED",
          message: `Order ${order.orderId} ${status.toLowerCase()} — ${amountLabel} needs review`,
          connectorInstanceId: order.connectorInstanceId,
          correlationId: order.orderId,
          context: { orderId: order.orderId, status, amount, currency },
        });
      } else if (DELAYED_STATUSES.has(status)) {
        queueAlert({
          id: alertId(siteId, `${order.id}:ORDER_DELAYED`),
          severity: "high",
          alertType: "ORDER_DELAYED",
          message: `Order ${order.orderId} is delayed (status: ${status.toLowerCase()})`,
          connectorInstanceId: order.connectorInstanceId,
          correlationId: order.orderId,
          context: { orderId: order.orderId, status, amount, currency },
        });
      }
    }

    // Per-store signal: a store has orders but none landed in the last hour.
    for (const [connectorId, counts] of byConnector) {
      if (counts.total > 0 && counts.lastHour === 0) {
        queueAlert({
          id: alertId(siteId, `${connectorId}:NO_RECENT_ORDERS`),
          severity: "critical",
          alertType: "NO_RECENT_ORDERS",
          message: "No orders received in the last hour for this store — possible ingestion outage",
          connectorInstanceId: connectorId,
          correlationId: `no-recent-orders:${connectorId}`,
          context: { ordersLastHour: 0, scanned: counts.total },
        });
      }
    }

    await Promise.all(upserts);

    // Auto-resolve order-derived alerts whose condition no longer holds, so the
    // Alert Center never shows stale signals for orders that have since recovered.
    await prisma.alert.updateMany({
      where: {
        siteId,
        module: "Orders",
        alertType: { in: ORDER_ALERT_TYPES },
        status: { in: ["TRIGGERED", "ACTIVE", "ACKNOWLEDGED"] },
        id: { notIn: qualifyingIds.length ? qualifyingIds : ["__none__"] },
      },
      data: { status: "RESOLVED", resolvedAt: now },
    });

    return qualifyingIds.length;
  }
}
