import { prisma } from '@kpi-platform/db';
import {
  PROJECT_PAGE_ACCESS_OPTIONS,
  PROJECT_PAGE_KEYS,
  ProjectPageKey,
  ROLE_ACCESS,
  normalizeRole
} from '@kpi-platform/shared-types';

const pageKeySet = new Set<ProjectPageKey>(PROJECT_PAGE_KEYS);

/**
 * Baseline page keys a role may access, sourced from the SAME ROLE_ACCESS table the
 * dashboard sidebar and client route guard use. This keeps the backend page-access
 * middleware consistent with the frontend: an ops_lead/analyst gets exactly their
 * role's pages by default, instead of the backend's old per-user-only model that
 * 403'd whenever no explicit UserPagePermission rows existed.
 */
const getRoleAllowedPageKeys = (role: unknown): ProjectPageKey[] => {
  const normalized = normalizeRole(role as any);
  if (!normalized) {
    return [];
  }

  return ROLE_ACCESS[normalized].sidebar.filter(
    (key): key is ProjectPageKey => pageKeySet.has(key as ProjectPageKey)
  );
};

export type PagePermissionRow = {
  pageKey: ProjectPageKey;
  isAllowed: boolean;
};

export const PagePermissionsService = {
  getPageKeyOptions() {
    return PROJECT_PAGE_ACCESS_OPTIONS;
  },

  normalizeSelectedPageKeys(input: unknown): ProjectPageKey[] {
    const rawKeys = Array.isArray(input) ? input : [];

    return rawKeys
      .map((value) => String(value).trim() as ProjectPageKey)
      .filter((value): value is ProjectPageKey => pageKeySet.has(value));
  },

  async getPermissionRows(userId: string, projectId: string): Promise<PagePermissionRow[]> {
    if (!userId || !projectId) {
      return [];
    }

    const rows = await prisma.userPagePermission.findMany({
      where: { userId, projectId },
      select: {
        pageKey: true,
        isAllowed: true
      }
    });

    return rows.map((row) => ({
      pageKey: row.pageKey as ProjectPageKey,
      isAllowed: row.isAllowed
    }));
  },

  async getAllowedPageKeys(user: { id: string; role: string }, projectId: string): Promise<ProjectPageKey[]> {
    if (!user?.id || !projectId) {
      return [];
    }

    if (normalizeRole(user.role) === 'super_admin') {
      return PROJECT_PAGE_KEYS;
    }

    // Start from the role's baseline (matches the frontend ROLE_ACCESS), then let
    // explicit per-user rows refine it: isAllowed:true adds an extra page, isAllowed:false
    // revokes one. With no explicit rows the user simply gets their full role baseline.
    const allowed = new Set<ProjectPageKey>(getRoleAllowedPageKeys(user.role));
    const rows = await PagePermissionsService.getPermissionRows(user.id, projectId);

    for (const row of rows) {
      if (row.isAllowed) {
        allowed.add(row.pageKey);
      } else {
        allowed.delete(row.pageKey);
      }
    }

    return Array.from(allowed);
  },

  async getPermissionMatrix(userId: string, projectId: string) {
    const rows = await PagePermissionsService.getPermissionRows(userId, projectId);

    if (rows.length === 0) {
      return PROJECT_PAGE_ACCESS_OPTIONS.map((option) => ({
        ...option,
        isAllowed: true
      }));
    }

    const allowed = new Set(rows.filter((row) => row.isAllowed).map((row) => row.pageKey));

    return PROJECT_PAGE_ACCESS_OPTIONS.map((option) => ({
      ...option,
      isAllowed: allowed.has(option.key)
    }));
  },

  async replaceUserPagePermissions(userId: string, projectId: string, selectedPageKeys: unknown) {
    const normalized = new Set(PagePermissionsService.normalizeSelectedPageKeys(selectedPageKeys));

    return prisma.$transaction(async (tx) => {
      await Promise.all(
        PROJECT_PAGE_KEYS.map((pageKey) =>
          tx.userPagePermission.upsert({
            where: {
              userId_projectId_pageKey: {
                userId,
                projectId,
                pageKey
              }
            },
            update: {
              isAllowed: normalized.has(pageKey)
            },
            create: {
              userId,
              projectId,
              pageKey,
              isAllowed: normalized.has(pageKey)
            }
          })
        )
      );

      return PROJECT_PAGE_ACCESS_OPTIONS.map((option) => ({
        ...option,
        isAllowed: normalized.has(option.key)
      }));
    });
  },

  async upsertInvitePermissions(userId: string, projectId: string, selectedPageKeys: unknown) {
    return this.replaceUserPagePermissions(userId, projectId, selectedPageKeys);
  }
};
