import React from 'react';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATOR' | 'CUSTOMER';

export interface RoleGateProps {
  children: React.ReactNode;
  userRole: UserRole;
  allowedRoles: UserRole[];
  fallback?: React.ReactNode;
}

/**
 * RoleGate component for conditionally rendering children based on user role.
 * This is a frontend visibility control; always pair with backend checks.
 */
export const RoleGate: React.FC<RoleGateProps> = ({
  children,
  userRole,
  allowedRoles,
  fallback = null
}) => {
  const hasAccess = allowedRoles.includes(userRole);

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};
