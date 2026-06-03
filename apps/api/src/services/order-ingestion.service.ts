import { prisma } from "@kpi-platform/db";
import { orderNormalizationService } from "./order-normalization.service";
import crypto from "crypto";

/**
 * Validate + normalize a currency code to an uppercase 3-letter ISO 4217 code.
 * Returns null for empty/invalid input so callers can fall through their own chain.
 */
const normalizeCurrencyCode = (value: any): string | null => {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
};

export class OrderIngestionService {
  /**
   * Simulates CSV parsing for offline orders.
   * Expected format: Order ID, SKU, Payment Method, Total Amount
   */
  static async processCSV(siteId: string, csvContent: string) {
    const lines = csvContent.split("\n").filter((l) => l.trim().length > 0);
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    const batchId = `csv_${Date.now()}`;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(",").map((p) => p.trim());

      if (parts.length < 4) {
        results.failed++;
        results.errors.push(
          `Row ${i + 1}: Missing fields. Expected 4, got ${parts.length}`,
        );
        continue;
      }

      const [orderId, sku, paymentMethod, amountStr] = parts;
      const amount = parseFloat(amountStr);

      if (isNaN(amount)) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: Invalid amount "${amountStr}"`);
        continue;
      }

      // Normalization & Storage
      try {
        const rawEvent = {
          eventId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          metadata: {
            orderId,
            sku,
            paymentMethod,
            amount,
            channel: "POS",
            orderSource: "offline",
          },
        };

        const project = await prisma.project.findUnique({
          where: { id: siteId },
          select: { tenantId: true },
        });
        const tenantId = project?.tenantId || "system";

        const canonical = await orderNormalizationService.normalize(
          "offline",
          rawEvent,
          siteId,
          tenantId,
        );

        await prisma.canonicalOrder.create({
          data: {
            ...canonical,
            siteId: siteId,
            tenantId,
            channel: "POS",
            lifecycleState: "PLACED",

            normalizedStatus: "PLACED",
            mappingVersion: "v1",
          },
        });

        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Connector-based offline order ingestion (CSV / Excel upload).
   *
   * When `targetConnectorId` is provided, the offline orders are merged into
   * that existing store (connector instance) so online + offline data can be
   * analysed together in a single store. Otherwise a dedicated "csv"
   * ConnectorInstance is created.
   *
   * Each column-mapped row is normalized through the shared normalization
   * pipeline, persisted with channel "OFFLINE" linked to the connector, and a
   * ConnectorSyncRun is recorded so the upload surfaces in the Connector
   * Reliability Matrix.
   */
  static async ingestCsvRows(
    siteId: string,
    connectorName: string,
    rows: any[],
    targetConnectorId?: string | null,
    importCurrency?: string | null,
  ) {
    // Operator-selected currency for this import. Offline spreadsheets rarely
    // carry a currency, so we apply the chosen one to every row rather than
    // silently assuming USD. Falls back to USD only if nothing valid is supplied.
    const resolvedCurrency = normalizeCurrencyCode(importCurrency) || "USD";
    const results = {
      connectorId: "",
      success: 0,
      failed: 0,
      total: Array.isArray(rows) ? rows.length : 0,
      errors: [] as string[],
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("No rows provided for ingestion.");
    }

    const project = await prisma.project.findUnique({
      where: { id: siteId },
      select: { tenantId: true },
    });
    const tenantId = project?.tenantId || "system";

    const now = new Date();
    let connectorId: string;
    let isExistingStore = false;

    if (targetConnectorId) {
      // Merge into an existing store: validate it belongs to this project.
      const existing = await prisma.connectorInstance.findFirst({
        where: { id: targetConnectorId, siteId },
        select: { id: true, recordsByType: true },
      });
      if (!existing) {
        throw new Error("Selected store was not found for this project.");
      }
      connectorId = existing.id;
      isExistingStore = true;
    } else {
      // No target store: create a dedicated CSV connector instance up front.
      connectorId = crypto.randomUUID();
      await prisma.connectorInstance.create({
        data: {
          id: connectorId,
          siteId,
          tenantId,
          providerId: "csv",
          label: (connectorName || "Offline Orders").trim(),
          category: "COMMERCE",
          family: "OFFLINE",
          version: "1.0.0",
          status: "ACTIVE",
          lifecycleState: "CONNECTED",
          healthStatus: "HEALTHY",
          healthScore: 100,
          syncConfig: { type: "offline", source: "csv_upload", defaultCurrency: resolvedCurrency },
          recordsByType: { orders: rows.length },
          lastSyncAt: now,
          lastAttemptAt: now,
        },
      });
    }

    results.connectorId = connectorId;

    // 2. Normalize + persist each row.
    for (let i = 0; i < rows.length; i++) {
      try {
        const canonical = await orderNormalizationService.normalize(
          "csv",
          rows[i],
          siteId,
          tenantId,
          { defaultCurrency: resolvedCurrency },
        );

        await prisma.canonicalOrder.create({
          data: {
            id: canonical.id,
            siteId,
            tenantId,
            connectorInstanceId: connectorId,
            orderId: String(canonical.orderId),
            externalReferenceId: canonical.externalReferenceId
              ? String(canonical.externalReferenceId)
              : null,
            sourceSystem: "csv",
            channel: "OFFLINE",
            lifecycleState: canonical.lifecycleState || "PLACED",
            normalizedStatus: canonical.lifecycleState || "PLACED",
            // Operator-selected currency wins; a currency on the row (if ever mapped)
            // is honoured next; USD is only a last-resort safety net.
            currency: normalizeCurrencyCode(canonical.currency) || resolvedCurrency,
            totalAmount: canonical.totalAmount ?? 0,
            taxAmount: canonical.taxAmount ?? 0,
            discountAmount: canonical.discountAmount ?? 0,
            paidAmount: canonical.paidAmount ?? 0,
            refundedAmount: canonical.refundedAmount ?? 0,
            placedAt: new Date(canonical.placedAt),
            mappingVersion: "csv/v1",
            metadata: canonical.metadata || {},
          },
        });

        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    // 3. Record the sync run (feeds matrix metrics) + reflect partial health.
    const runStatus = results.failed > 0 ? "PARTIAL" : "SUCCESS";
    await prisma.connectorSyncRun.create({
      data: {
        id: crypto.randomUUID(),
        connectorInstanceId: connectorId,
        syncType: "BACKFILL",
        status: runStatus,
        startedAt: now,
        finishedAt: new Date(),
        recordsFetched: results.total,
        recordsProcessed: results.success,
        recordsFailed: results.failed,
      },
    });

    if (isExistingStore) {
      // Merged into an existing store: bump the orders count and sync timestamps
      // without disturbing the live store's health (e.g. a connected Shopify store).
      const current = await prisma.connectorInstance.findUnique({
        where: { id: connectorId },
        select: { recordsByType: true },
      });
      const existingOrders = Number((current?.recordsByType as any)?.orders || 0);
      await prisma.connectorInstance.update({
        where: { id: connectorId },
        data: {
          recordsByType: {
            ...((current?.recordsByType as any) || {}),
            orders: existingOrders + results.success,
          },
          lastSyncAt: now,
          lastAttemptAt: now,
        },
      });
    } else if (results.failed > 0) {
      await prisma.connectorInstance.update({
        where: { id: connectorId },
        data: {
          healthStatus: "DEGRADED",
          healthScore: results.success === 0 ? 0 : 70,
        },
      });
    }

    // 4. Audit trail.
    await prisma.connectorLifecycleEvent.create({
      data: {
        id: crypto.randomUUID(),
        tenantId,
        projectId: siteId,
        connectorInstanceId: connectorId,
        eventType: "CONNECTOR_SYNCED",
        severity: results.failed > 0 ? "WARNING" : "INFO",
        payload: {
          source: "csv_upload",
          success: results.success,
          failed: results.failed,
        },
        triggeredBy: "USER",
      },
    });

    return results;
  }

  /**
   * Simulates external system sync (OMS, ERP, POS)
   */
  static async syncExternalSystem(
    siteId: string,
    system: "OMS" | "ERP" | "POS",
  ) {
    const syncId = `sync_${Date.now()}`;

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Mock success with some random failure probability
    const success = Math.random() > 0.1;

    // Log lifecycle event for the sync
    await prisma.connectorLifecycleEvent.create({
      data: {
        id: crypto.randomUUID(),
        tenantId: "system",
        projectId: siteId,
        connectorInstanceId: system,
        eventType: success ? "CONNECTOR_SYNCED" : "CONNECTOR_SYNC_FAILED",
        severity: success ? "INFO" : "ERROR",
        payload: { system, recordCount: 0 },
        triggeredBy: "SYSTEM",
      },
    });

    return { success, syncId };
  }
}