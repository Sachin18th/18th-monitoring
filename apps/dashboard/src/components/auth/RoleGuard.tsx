'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from 'next/navigation';

interface RoleGuardProps {
    children: React.ReactNode;
    allowedRoles: string[];
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ children, allowedRoles }) => {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        if (!isLoading) {
            if (!user || !allowedRoles.includes(user.role)) {
                router.push('/unauthorized');
            } else {
                setIsAuthorized(true);
            }
        }
    }, [user, isLoading, allowedRoles, router]);

    if (isLoading || !isAuthorized) {
        return (
            <div style={{ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Verifying permissions...
            </div>
        );
    }

    return <>{children}</>;
};
