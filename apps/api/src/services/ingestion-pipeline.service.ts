import {
  IngestionEnvelope,
  IngestionProcessingStatus,
  IngestionValidationReport,
  IngestionEventRecord,
} from "@kpi-platform/shared-types";
import { prisma } from "@kpi-platform/db";
import { ConnectorRegistry } from "../../../../packages/connector-framework/src/registry";
import { PipelineWorker } from "./pipeline-worker.service";
import crypto from "crypto";

export class IngestionPipeline {
  /**
   * Entry point for all inbound data (Webhooks, Pollers, Files)
   */
  public static async intake(
    envelope: IngestionEnvelope,
  ): Promise<IngestionEventRecord> {
    const correlationId = envelope.id;
    console.log(
      `[Ingestion] ▶ Incoming ${envelope.mode} intake for project ${envelope.projectId} | correlationId=${correlationId}`,
    );

    // 1. Initialize Ingestion Record
    const eventRecord: IngestionEventRecord = {
      id: crypto.randomUUID(),
      envelopeId: correlationId,
      tenantId: envelope.tenantId,
      projectId: envelope.projectId,
      integrationId: envelope.integrationId,
      mode: envelope.mode,
      status: "RECEIVED",
      validation: {
        isValid: false,
        stages: {
          auth: { status: "SKIP" },
          scope: { status: "PASS" },
          schema: { status: "SKIP" },
          dedupe: { status: "PASS", isDuplicate: false },
        },
        errors: [],
        warnings: [],
      },
      sourceReferenceId: envelope.sourceEventId,
      receivedAt: envelope.receivedAt,
      updatedAt: new Date().toISOString(),
    };

    // 2. Run Validation Pipeline
    await this.runValidation(envelope, eventRecord);

    // 3. Archival (Raw Payload Persistence)
    const artifactId = crypto.randomUUID();
    const payloadString = JSON.stringify(envelope.payload);

    eventRecord.artifactId = artifactId;

    await prisma.ingestionEvent.create({
      data: {
        id: eventRecord.id,
        tenantId: envelope.tenantId,
        projectId: envelope.projectId,
        integrationId: envelope.integrationId,

        mode: envelope.mode,
        status: "PENDING",

        correlationId: envelope.id, 
        sourceReferenceId: envelope.sourceEventId, 

        validationReport: eventRecord.validation as any,

        dedupeKey: envelope.sourceEventId || null,

        receivedAt: new Date(envelope.receivedAt),
        updatedAt: new Date(),
      },
    });

    // 4. Traceability & Deduplication Check
    if (eventRecord.validation.isValid) {
      const isDuplicate = await this.checkDeduplication(envelope);
      if (isDuplicate) {
        eventRecord.validation.stages.dedupe = {
          status: "FAIL",
          isDuplicate: true,
        };
        eventRecord.validation.isValid = false;
        eventRecord.status = "REJECTED";
        eventRecord.error = {
          code: "DUPLICATE_INGESTION",
          message: "Payload has already been processed.",
        };
      } else {
        eventRecord.status = "ARCHIVED";
      }
    } else {
      eventRecord.status = "REJECTED";
    }

    // 5. Handoff to Queue (Downstream Processing)
    if (eventRecord.status === "ARCHIVED") {
      try {
        const messageId = await this.enqueueForProcessing(envelope);
        eventRecord.queueMessageId = messageId;
        eventRecord.status = "QUEUED";
      } catch (err: any) {
        eventRecord.status = "FAILED";
        eventRecord.error = { code: "QUEUE_ERROR", message: err.message };
      }
    }

    // 6. Update final status in database
    await prisma.ingestionEvent.update({
      where: { id: eventRecord.id },
      data: { status: eventRecord.status as any },
    });

    console.log(
      `[Ingestion] ✓ Processed ${envelope.mode} | Result: ${eventRecord.status} | eventId=${eventRecord.id}`,
    );
    return eventRecord;
  }

  private static async runValidation(
    envelope: IngestionEnvelope,
    record: IngestionEventRecord,
  ) {
    const { stages, errors } = record.validation;

    // Stage 1: Scope Validation (Mandatory for multi-tenancy)
    if (!envelope.tenantId || !envelope.projectId) {
      stages.scope = {
        status: "FAIL",
        message: "Missing tenant or project scope",
      };
      errors.push("CRITICAL: Data attribution scope missing.");
    } else {
      const project = await prisma.project.findUnique({
        where: { id: envelope.projectId },
        select: { tenantId: true },
      });
      if (!project || project.tenantId !== envelope.tenantId) {
        stages.scope = {
          status: "FAIL",
          message: "Invalid project-tenant mapping",
        };
        errors.push(
          "CRITICAL: Originating project does not match authenticated tenant.",
        );
      }
    }

    // Stage 2: Connector-Specific Security (HMAC, Auth Context)
    if (envelope.mode === "WEBHOOK" && envelope.integrationId) {
      const connector = ConnectorRegistry.get(envelope.connectorType || "");
      if (connector) {
        const isValidSignature = await connector.validateWebhookSignature(
          envelope.payload,
          envelope.metadata.headers,
          {},
        );
        stages.auth = {
          status: isValidSignature ? "PASS" : "FAIL",
          message: isValidSignature
            ? undefined
            : "Webhook signature validation failed",
        };
        if (!isValidSignature)
          errors.push("High Severity: Webhook signature verification failed.");
      }
    }

    // Stage 3: Schema / Payload Integrity
    if (
      !envelope.payload ||
      (typeof envelope.payload === "object" &&
        Object.keys(envelope.payload).length === 0)
    ) {
      stages.schema = { status: "FAIL", message: "Empty payload" };
      errors.push("Payload is empty or null.");
    }

    record.validation.isValid = errors.length === 0;
  }

private static async checkDeduplication(
  envelope: IngestionEnvelope
): Promise<boolean> {

  if (!envelope.sourceEventId) return false;

  const existing = await prisma.ingestionEvent.findFirst({
    where: {
      sourceReferenceId: envelope.sourceEventId, 
      integrationId: envelope.integrationId,      
      receivedAt: {                             
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    }
  });

  return !!existing;
}

  private static async enqueueForProcessing(
    envelope: IngestionEnvelope,
  ): Promise<string> {
    // Enqueue into the formal Pipeline tracking system
    return await PipelineWorker.dispatchTransformationJob(envelope);
  }
}
