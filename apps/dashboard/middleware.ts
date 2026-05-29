import { NextRequest, NextResponse } from 'next/server';
import { PROJECT_PAGE_ACCESS_OPTIONS, PROJECT_PAGE_KEYS } from '@kpi-platform/shared-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const MANAGEMENT_PAGE_KEYS = PROJECT_PAGE_KEYS.filter((key) => key.startsWith('management/'));

const getRequestedPageKey = (pathname: string) => {
  const projectMatch = pathname.match(/^\/project\/([^/]+)(.*)$/);

  if (!projectMatch) {
    return null;
  }

  const tail = projectMatch[2] || '';
  const normalizedTail = tail === '' ? '/overview' : tail;

  if (normalizedTail === '/management') {
    return 'management';
  }

  const matched = PROJECT_PAGE_ACCESS_OPTIONS.find((option) => {
    return normalizedTail === option.path || normalizedTail.startsWith(`${option.path}/`);
  });

  return matched?.key || null;
};

const hasManagementAccess = (allowedKeys: string[]) => {
  return MANAGEMENT_PAGE_KEYS.some((key) => allowedKeys.includes(key));
};

const getFallbackPageKey = (allowedKeys: string[], isSuperAdmin: boolean) => {
  const fallbackOption = PROJECT_PAGE_ACCESS_OPTIONS.find((option) => {
    if (!allowedKeys.includes(option.key)) {
      return false;
    }

    return isSuperAdmin || !option.superAdminOnly;
  });

  return fallbackOption?.key || null;
};

export async function middleware(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;
  const sessionToken = request.cookies.get('session-token')?.value;

  if (!sessionToken) {
    return NextResponse.redirect(new URL('/login', origin));
  }

  const headers = {
    Authorization: `Bearer ${decodeURIComponent(sessionToken)}`,
    'session-token': decodeURIComponent(sessionToken)
  };

  try {
    const meResponse = await fetch(`${API_BASE}/api/v1/user/me`, {
      headers,
      cache: 'no-store'
    });

    if (!meResponse.ok) {
      return NextResponse.redirect(new URL('/login', origin));
    }

    const mePayload = await meResponse.json();
    const user = mePayload?.data?.user || mePayload?.user;

    if (!user) {
      return NextResponse.redirect(new URL('/login', origin));
    }

    const projectMatch = pathname.match(/^\/project\/([^/]+)/);
    const projectId = projectMatch?.[1];

    if (!projectId) {
      return NextResponse.next();
    }

    if (user.role === 'SUPER_ADMIN') {
      return NextResponse.next();
    }

    const permissionsResponse = await fetch(`${API_BASE}/api/v1/user/permissions?projectId=${encodeURIComponent(projectId)}`, {
      headers,
      cache: 'no-store'
    });

    const permissionPayload = permissionsResponse.ok ? await permissionsResponse.json() : null;
    const allowedPageKeys: string[] = Array.isArray(permissionPayload?.data?.allowedPageKeys)
      ? permissionPayload.data.allowedPageKeys
      : Array.isArray(permissionPayload?.allowedPageKeys)
        ? permissionPayload.allowedPageKeys
        : [];
    const hasExplicitPermissions = Boolean(permissionPayload?.data?.hasExplicitPermissions || permissionPayload?.hasExplicitPermissions);

    const requestedPageKey = getRequestedPageKey(pathname);

    if (!requestedPageKey) {
      return NextResponse.next();
    }


    const fallbackPageKey = getFallbackPageKey(allowedPageKeys, user.role === 'SUPER_ADMIN');
    const fallbackUrl = fallbackPageKey
      ? new URL(`/project/${encodeURIComponent(projectId)}/${PROJECT_PAGE_ACCESS_OPTIONS.find((option) => option.key === fallbackPageKey)?.path.replace(/^\//, '')}`, origin)
      : new URL('/unauthorized', origin);

    const overviewUrl = new URL(`/project/${encodeURIComponent(projectId)}/overview`, origin);

    // Require explicit permissions for management pages.
    if (requestedPageKey === 'management') {
      if (!hasExplicitPermissions) {
        return NextResponse.redirect(fallbackUrl);
      }

      if (hasManagementAccess(allowedPageKeys)) {
        return NextResponse.next();
      }

      return NextResponse.redirect(fallbackUrl);
    }

    // If the backend did not return explicit permissions for this user/project,
    // redirect back to the overview instead of letting the user stay on a
    // restricted deep link.
    if (!hasExplicitPermissions) {
      return NextResponse.redirect(fallbackUrl);
    }

    if (!allowedPageKeys.includes(requestedPageKey)) {
      return NextResponse.redirect(fallbackUrl);
    }

    return NextResponse.next();
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/project/:path*']
};
