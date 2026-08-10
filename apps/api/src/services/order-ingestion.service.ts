import { prisma } from "@kpi-platform/db";
import { getDataPlaneClient, getSiteDataPlaneClient } from "../lib/tenant-prisma";
import { orderNormalizationService } from "./order-normalization.service";
import { IdentityResolver } from "./identity-resolver.service";
import crypto from "crypto";

/**
 * Validate + normalize a currency code to an uppercase 3-letter ISO 4217 code.
 * Returns null for empty/invalid input so callers can fall through their own chain.
 */
const normalizeCurrencyCode = (value: any): string | null => {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
};

/**
 * Per-import summary of how offline rows attached to the customer golden record.
 * The match figures are counted at CUSTOMER level, not row level: one shopper often
 * appears on many rows, so row counts would overstate how many people were reached.
 */
export interface OfflineIdentityReport {
  /** False when the import created its own CSV connector: profiles live per connector,
   *  so there is nothing to match against. Matching needs an existing store selected. */
  matchingEnabled: boolean;
  /** Distinct existing customers these offline orders were attached to. */
  customersMatched: number;
  /** Distinct new (offline-only) customers created by this import. */
  customersCreated: number;
  /** Rows that ended up linked to a customer profile. */
  rowsLinked: number;
  /** Rows with no email / phone / loyalty id to match on. */
  rowsUnidentified: number;
  /** Rows whose phone matched someone who already has a different email — left
   *  deliberately unmerged for human review rather than guessed at. */
  phoneConflicts: number;
}

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

    // DATABASE-PER-INTEGRATION: canonical_orders is a data-plane table — no
    // connector id in scope here, so route via the site's store DB.
    const db = await getSiteDataPlaneClient(siteId);

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

        await db.canonicalOrder.create({
          data: {
            ...canonical,
            siteId: siteId,
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
    const identity: OfflineIdentityReport = {
      matchingEnabled: Boolean(targetConnectorId),
      customersMatched: 0,
      customersCreated: 0,
      rowsLinked: 0,
      rowsUnidentified: 0,
      phoneConflicts: 0,
    };
    const results = {
      connectorId: "",
      success: 0,
      failed: 0,
      total: Array.isArray(rows) ? rows.length : 0,
      errors: [] as string[],
      identity,
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

    // DATABASE-PER-INTEGRATION: canonical_orders rows for this connector must
    // land in the connector's physical store DB (fails closed if not active).
    const db = await getDataPlaneClient(connectorId);

    // One customer usually appears on several rows (repeat visits within the export),
    // so cache the resolution for the run instead of re-resolving per row. Also lets
    // the report count customers rather than rows.
    // NOTE: each row becomes its OWN canonical order — this importer has no
    // line-item grouping, so a till export must be one row per order, not per item.
    const resolvedByIdentity = new Map<string, string>();
    const matchedProfileIds = new Set<string>();
    const createdProfileIds = new Set<string>();

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

        // 2a. Attach the row to the customer golden record. This is what makes an
        //     in-store purchase show up against the same person who shops online:
        //     the email/phone hashes computed by the normalizer are the join keys.
        const customerProfileId = await this.resolveOfflineCustomer(
          db,
          { siteId, connectorInstanceId: connectorId },
          canonical.metadata || {},
          { identity, resolvedByIdentity, matchedProfileIds, createdProfileIds },
        );

        await db.canonicalOrder.create({
          data: {
            id: canonical.id,
            siteId,
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
            customerProfileId,
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
          identity,
        },
        triggeredBy: "USER",
      },
    });

    return results;
  }

  /**
   * Resolve one offline/POS row to a CustomerProfile, or null when the row carries
   * no identifier at all (a cash walk-in with no details captured).
   *
   * Match keys, strongest first: loyalty id → email hash → phone hash. All three go
   * to the shared IdentityResolver, so an in-store purchase lands on exactly the same
   * golden record as that shopper's online orders and browsing behavior — which only
   * works because the offline rows were merged into the online store's connector.
   *
   * Resolution never fails a row: the order itself is the payload and is worth more
   * than the attribution, so errors are logged and the order is stored unlinked.
   */
  private static async resolveOfflineCustomer(
    db: any,
    scope: { siteId: string; connectorInstanceId: string },
    metadata: Record<string, any>,
    run: {
      identity: OfflineIdentityReport;
      resolvedByIdentity: Map<string, string>;
      matchedProfileIds: Set<string>;
      createdProfileIds: Set<string>;
    },
  ): Promise<string | null> {
    const emailHash = metadata.customerEmailHash || null;
    const phoneHash = metadata.customerPhoneHash || null;
    const loyaltyId = metadata.loyaltyId || null;

    if (!emailHash && !phoneHash && !loyaltyId) {
      run.identity.rowsUnidentified++;
      return null;
    }

    const cacheKey = `${loyaltyId || ""}|${emailHash || ""}|${phoneHash || ""}`;
    const cached = run.resolvedByIdentity.get(cacheKey);
    if (cached) {
      run.identity.rowsLinked++;
      return cached;
    }

    try {
      const result = await IdentityResolver.resolve(db, scope, {
        emailHash,
        emailEncrypted: metadata.customerEmailEncrypted || null,
        phoneHash,
        externalId: loyaltyId,
        platform: "pos",
        source: "csv_upload",
      });

      if (result.phoneConflict) run.identity.phoneConflicts++;
      if (result.created) {
        if (!run.createdProfileIds.has(result.profileId)) {
          run.createdProfileIds.add(result.profileId);
          run.identity.customersCreated++;
        }
      } else if (
        // A profile this same import created counts as created, not matched, even
        // when a later row resolves to it through a different identifier mix.
        !run.matchedProfileIds.has(result.profileId) &&
        !run.createdProfileIds.has(result.profileId)
      ) {
        run.matchedProfileIds.add(result.profileId);
        run.identity.customersMatched++;
      }

      run.resolvedByIdentity.set(cacheKey, result.profileId);
      run.identity.rowsLinked++;
      return result.profileId;
    } catch (err: any) {
      console.error("[OrderIngestionService] offline identity resolution failed", {
        connectorInstanceId: scope.connectorInstanceId,
        error: err?.message,
      });
      return null;
    }
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