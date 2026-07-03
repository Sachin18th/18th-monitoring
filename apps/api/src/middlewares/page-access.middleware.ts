import type { ProjectPageKey } from '../../../../packages/shared-types/src/page-access';
import { PagePermissionsService } from '../services/page-permissions.service';

export const requirePageAccess = (required: ProjectPageKey | ProjectPageKey[]) => {
  const requiredKeys = Array.isArray(required) ? required : [required];

  return async (req: any, reply: any) => {
    const projectId = String(
      req.params?.siteId || req.query?.siteId || req.query?.projectId || req.siteId || req.body?.projectId || ''
    ).trim();

    if (!projectId) {
      return reply.code(400).send({ error: 'Missing projectId' });
    }

    if (req.user?.role === 'SUPER_ADMIN') {
      return;
    }

    // No explicit per-page rows means "default allow" — consistent with
    // PagePermissionsService.getAllowedPageKeys / getPermissionMatrix, which both
    // grant full access when no UserPagePermission rows exist for the user/project.
    // getAllowedPageKeys returns every page key in that case, so the check below
    // naturally passes without a special-cased early 403.
    const allowedKeys = await PagePermissionsService.getAllowedPageKeys(req.user, projectId);
    const allowedSet = new Set(allowedKeys);
    const hasAccess = requiredKeys.some((key) => allowedSet.has(key));

    if (!hasAccess) {
      const redirectTo = `/project/${encodeURIComponent(projectId)}/overview`;
      reply.header('Location', redirectTo);
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'You do not have access to this page.',
        redirectTo
      });
    }
  };
};

export default requirePageAccess;
