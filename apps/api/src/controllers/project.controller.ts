import { prisma } from "@kpi-platform/db";
import { successResponse, errorResponse } from "../utils/response";
import crypto from "crypto";
import { z } from "zod";
import { getTenantDatabasesByTenant, getProvisioningEvents } from "../services/tenant-database.service";

/**
 * Validation schema for creating a new project
 */
export const CreateProjectSchema = z.object({
  name: z.string()
    .min(3, "Project name must be at least 3 characters")
    .max(100, "Project name must not exceed 100 characters"),
  slug: z.string()
    .min(1, "Slug is required")
    .max(100, "Slug must not exceed 100 characters")
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Slug must be lowercase with hyphens only, no spaces or special characters"),
  description: z.string()
    .max(500, "Description must not exceed 500 characters")
    .optional(),
  timezone: z.string()
    .default("UTC"),
});

export type CreateProjectPayload = z.infer<typeof CreateProjectSchema>;

export const createProject = async (req: any, reply: any) => {
  const { name, slug, description, timezone } = req.body as CreateProjectPayload;
  const { tenantId, id: userId } = req.user;

  // Check if slug already exists for this tenant
  const existing = await prisma.project.findFirst({
    where: { tenantId, slug },
  });

  if (existing) {
    return reply
      .code(409)
      .send(
        errorResponse(
          "A project with this slug already exists.",
          "DUPLICATE_SLUG",
        ),
      );
  }

  const projectId = `proj_${crypto.randomBytes(8).toString("hex")}`;

  const newProject = await prisma.project.create({
    data: {
      id: projectId,
      tenantId,
      name,
      slug,
      status: "ACTIVE",
      environment: "production",
      settings: { 
        description: description || null, 
        timezone: timezone || "UTC" 
      },
      createdBy: userId,
    },
  }) as any;

  // NOTE: store databases are provisioned per INTEGRATION (see
  // IntegrationController.runInitialSetup), not per project — a fresh project
  // has no data-plane database until its first integration is created.

  return reply.code(201).send(
    successResponse({
      id: newProject.id,
      name: newProject.name,
      slug: newProject.slug || slug,
      description: (newProject.settings as any)?.description || null,
      timezone: (newProject.settings as any)?.timezone || "UTC",
      createdBy: userId,
      createdAt: newProject.createdAt,
    })
  );
};

export const updateProject = async (req: any, reply: any) => {
  const { siteId } = req.params;
  const updates = req.body;

  const project = await prisma.project.findUnique({ where: { id: siteId } });
  if (!project) {
    return reply
      .code(404)
      .send(errorResponse("Project not found.", "NOT_FOUND"));
  }

  // Tenant check (Isolation)
  if (
    project.tenantId !== req.user.tenantId &&
    req.user.role !== "SUPER_ADMIN"
  ) {
    return reply
      .code(403)
      .send(
        errorResponse(
          "You do not have permission to modify this project.",
          "FORBIDDEN",
        ),
      );
  }

  const updatedProject = await prisma.project.update({
    where: { id: siteId },
    data: {
      name: updates.name ?? project.name,
      environment: updates.environment ?? project.environment,
      status: updates.status ?? project.status,
      settings: {
        ...(project.settings as Record<string, any>),
        ...(updates.settings ?? {}),
      },
    },
  });

  return reply.code(200).send(successResponse(updatedProject));
};

/**
 * GET the current tenant's store-database provisioning status + recent
 * lifecycle events — one entry per integration (database-per-integration).
 * Powers the onboarding progress indicator (same polling UX as the connector
 * initial-sync status). Tenant is taken from the caller's JWT.
 */
export const getTenantDatabaseStatus = async (req: any, reply: any) => {
  const { tenantId } = req.user;

  const rows = await getTenantDatabasesByTenant(tenantId);
  if (rows.length === 0) {
    return reply.code(200).send(
      successResponse({
        status: "not_provisioned",
        tenantId,
        databases: [],
      })
    );
  }

  const databases = await Promise.all(
    rows.map(async (row) => {
      const events = await getProvisioningEvents(row.id);
      return {
        status: row.status, // pending | provisioning | active | failed
        connectorInstanceId: row.connectorInstanceId,
        projectId: row.projectId,
        dbName: row.dbName,
        provisionedAt: row.provisionedAt,
        lastMigrationVersion: row.lastMigrationVersion,
        lastError: row.lastError ?? null,
        events: events.map((e) => ({
          eventType: e.eventType,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          severity: e.severity,
          at: e.createdAt,
        })),
      };
    })
  );

  // Overall status: failed > provisioning/pending > active — the worst state
  // wins so the onboarding indicator surfaces problems.
  const overall = databases.some((d) => d.status === "failed")
    ? "failed"
    : databases.some((d) => d.status !== "active")
      ? "provisioning"
      : "active";

  return reply.code(200).send(
    successResponse({
      status: overall,
      tenantId,
      databases,
    })
  );
};
