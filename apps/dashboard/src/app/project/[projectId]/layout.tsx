import React from 'react';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
	// Every project route is guarded in one place. ProtectedRoute derives the
	// requested page from the URL and checks it against the current user's role
	// (single source of truth: @kpi-platform/shared-types). Unauthorized users
	// see the restricted page instead of the route's content.
	return <ProtectedRoute>{children}</ProtectedRoute>;
}
