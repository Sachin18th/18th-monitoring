import { NextRequest, NextResponse } from 'next/server';
import {
  canAccessProjectPath,
  getDefaultProjectPathForRole,
  normalizeRole,
  resolveProjectPageKeyFromPath,
} from '@kpi-platform/shared-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

    const projectMatch = pathname.match(/^\/project\/([^/]+)(.*)$/);
    const projectId = projectMatch?.[1];

    if (!projectId) {
      return NextResponse.next();
    }

    const tail = projectMatch?.[2] || '';
    const normalizedRole = normalizeRole(user.role);
    const defaultProjectPath = getDefaultProjectPathForRole(normalizedRole || user.role);
    const redirectToDefault = () =>
      NextResponse.redirect(
        new URL(`/project/${encodeURIComponent(projectId)}${defaultProjectPath}`, origin),
      );

    if (!normalizedRole) {
      return redirectToDefault();
    }

    // The bare `/management` hub has no concrete page key; it is governance-only.
    // Any other unrecognised sub-route is sent to the role's default landing page.
    const pageKey = resolveProjectPageKeyFromPath(tail);
    if (!pageKey) {
      if (tail === '/management' && (normalizedRole === 'super_admin' || normalizedRole === 'admin')) {
        return NextResponse.next();
      }
      return redirectToDefault();
    }

    // Single source of truth: ROLE_ACCESS via canAccessProjectPath.
    if (!canAccessProjectPath(normalizedRole, tail)) {
      return redirectToDefault();
    }

    return NextResponse.next();
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/project/:path*']
};
