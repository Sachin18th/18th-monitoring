import { prisma } from '@kpi-platform/db';
import { PROJECT_PAGE_ACCESS_OPTIONS, PROJECT_PAGE_KEYS, ProjectPageKey } from '@kpi-platform/shared-types';

const pageKeySet = new Set<ProjectPageKey>(PROJECT_PAGE_KEYS);

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

    if (user.role === 'SUPER_ADMIN') {
      return PROJECT_PAGE_KEYS;
    }

    const rows = await PagePermissionsService.getPermissionRows(user.id, projectId);

    if (rows.length === 0) {
      return PROJECT_PAGE_KEYS;
    }

    return rows.filter((row) => row.isAllowed).map((row) => row.pageKey);
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
