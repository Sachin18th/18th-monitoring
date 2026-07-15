import crypto from 'crypto';
import { prisma } from '@kpi-platform/db';

/**
 * PHASE 1 — Control-plane state machine for physical database-per-integration
 * (one database per connector instance / connected store).
 *
 * This module owns the `tenant_databases` lifecycle and its append-only
 * `tenant_database_provisioning_events` log. It deliberately mirrors the
 * connector_instances + connector_lifecycle_events pattern already in this
 * codebase: a stateful row plus an event row per transition.
 *
 *   pending → provisioning → active | failed
 *   failed  → provisioning            (retry)
 *
 * Phase 1 provides ONLY the state primitives (no physical DB creation, no API
 * route). Phase 2's TenantDatabaseProvisioningService builds on top of these
 * to actually create + migrate the physical database.
 *
 * All writes here target the CONTROL-PLANE database (the shared `prisma`
 * client), so a row update + its event insert are done in a single Postgres
 * transaction — they cannot straddle a database boundary.
 */

export type TenantDatabaseStatus = 'pending' | 'provisioning' | 'active' | 'failed';

/** Allowed state transitions. Any transition not listed here is rejected. */
const VALID_TRANSITIONS: Record<TenantDatabaseStatus, TenantDatabaseStatus[]> = {
  pending: ['provisioning', 'failed'],
  provisioning: ['active', 'failed'],
  failed: ['provisioning'],
  active: [], // terminal
};

export class InvalidTenantDatabaseTransition extends Error {
  constructor(from: string, to: string) {
    super(`[tenant-database] Illegal state transition ${from} → ${to}`);
    this.name = 'InvalidTenantDatabaseTransition';
  }
}

function newId(): string {
  return crypto.randomUUID();
}

function severityFor(status: TenantDatabaseStatus): string {
  return status === 'failed' ? 'error' : 'info';
}

export interface CreatePendingInput {
  tenantId: string;
  /** The integration (connected store) this database belongs to. */
  connectorInstanceId: string;
  projectId: string;
  dbHost: string;
  dbName: string;
  dbUser: string;
  dbPort?: number;
  vaultKey?: string | null;
  /** Already-encrypted (enc:v1) envelope, or null if creds are stored later. */
  encryptedSecret?: string | null;
  triggeredBy?: string;
  correlationId?: string | null;
}

/**
 * Create the control-plane `tenant_databases` row in `pending` and log the
 * initial event. Idempotent on the integration: if a row already exists for
 * the connector instance it is returned untouched (each connected store has
 * exactly one physical DB).
 */
export async function createPendingTenantDatabase(input: CreatePendingInput) {
  const existing = await prisma.tenantDatabase.findUnique({
    where: { connectorInstanceId: input.connectorInstanceId },
  });
  if (existing) return existing;

  const id = newId();
  return prisma.$transaction(async (tx) => {
    const row = await tx.tenantDatabase.create({
      data: {
        id,
        tenantId: input.tenantId,
        connectorInstanceId: input.connectorInstanceId,
        projectId: input.projectId,
        dbHost: input.dbHost,
        dbPort: input.dbPort ?? 5432,
        dbName: input.dbName,
        dbUser: input.dbUser,
        vaultKey: input.vaultKey ?? null,
        encryptedSecret: input.encryptedSecret ?? null,
        status: 'pending',
      },
    });
    await tx.tenantDatabaseProvisioningEvent.create({
      data: {
        id: newId(),
        tenantDatabaseId: row.id,
        tenantId: row.tenantId,
        eventType: 'created',
        fromStatus: null,
        toStatus: 'pending',
        severity: 'info',
        triggeredBy: input.triggeredBy ?? 'system',
        correlationId: input.correlationId ?? null,
      },
    });
    return row;
  });
}

export interface TransitionInput {
  /** Merge-patched onto the row alongside the status change (e.g. provisionedAt, lastError). */
  patch?: Record<string, unknown>;
  errorDetail?: string | null;
  payload?: Record<string, unknown>;
  triggeredBy?: string;
  correlationId?: string | null;
  /** Skip the from→to validation (used only by a stuck-provision reaper). */
  force?: boolean;
}

/**
 * Move a tenant_databases row to `toStatus`, validating the transition and
 * writing a matching provisioning event — both in one control-plane
 * transaction. Returns the updated row. Throws InvalidTenantDatabaseTransition
 * on an illegal transition (unless `force`).
 */
export async function transitionTenantDatabase(
  tenantDatabaseId: string,
  toStatus: TenantDatabaseStatus,
  opts: TransitionInput = {}
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.tenantDatabase.findUnique({ where: { id: tenantDatabaseId } });
    if (!current) throw new Error(`[tenant-database] No row ${tenantDatabaseId}`);

    const from = current.status as TenantDatabaseStatus;
    if (from === toStatus) return current; // idempotent no-op
    if (!opts.force && !VALID_TRANSITIONS[from]?.includes(toStatus)) {
      throw new InvalidTenantDatabaseTransition(from, toStatus);
    }

    // Auto-stamp lifecycle timestamps for the common transitions.
    const autoPatch: Record<string, unknown> = {};
    if (toStatus === 'provisioning') autoPatch.provisioningStartedAt = new Date();
    if (toStatus === 'active') {
      autoPatch.provisionedAt = new Date();
      autoPatch.lastError = null;
    }
    if (toStatus === 'failed' && opts.errorDetail) {
      autoPatch.lastError = { message: opts.errorDetail, at: new Date().toISOString() };
    }

    const updated = await tx.tenantDatabase.update({
      where: { id: tenantDatabaseId },
      data: {
        status: toStatus,
        updatedAt: new Date(),
        ...autoPatch,
        ...(opts.patch ?? {}),
      },
    });

    await tx.tenantDatabaseProvisioningEvent.create({
      data: {
        id: newId(),
        tenantDatabaseId: updated.id,
        tenantId: updated.tenantId,
        eventType: `transition:${toStatus}`,
        fromStatus: from,
        toStatus,
        severity: severityFor(toStatus),
        payload: (opts.payload ?? {}) as any,
        errorDetail: opts.errorDetail ?? null,
        triggeredBy: opts.triggeredBy ?? 'system',
        correlationId: opts.correlationId ?? null,
      },
    });

    return updated;
  });
}

/** The store database row for one integration (connected store). */
export async function getTenantDatabaseByConnector(connectorInstanceId: string) {
  return prisma.tenantDatabase.findUnique({ where: { connectorInstanceId } });
}

/** All store database rows for a tenant (one per integration), newest last. */
export async function getTenantDatabasesByTenant(tenantId: string) {
  return prisma.tenantDatabase.findMany({
    where: { tenantId, connectorInstanceId: { not: null } },
    orderBy: { createdAt: 'asc' },
  });
}

/** Full transition trail for a tenant DB, oldest first. */
export async function getProvisioningEvents(tenantDatabaseId: string) {
  return prisma.tenantDatabaseProvisioningEvent.findMany({
    where: { tenantDatabaseId },
    orderBy: { createdAt: 'asc' },
  });
}
