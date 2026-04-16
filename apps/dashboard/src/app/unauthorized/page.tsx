import React from 'react';
import Link from 'next/link';

export default function UnauthorizedPage() {
    return (
        <div style={{
            height: '100vh', display: 'flex', flexDirection: 'column', 
            alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)',
            color: 'var(--text-primary)', textAlign: 'center', padding: '24px'
        }}>
            <div style={{ fontSize: '64px', marginBottom: '24px' }}>🔒</div>
            <h1 style={{ fontSize: '32px', fontWeight: '800', marginBottom: '12px' }}>Access Restricted</h1>
            <p style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '480px', marginBottom: '32px' }}>
                You do not have the required permissions to access this administrative section. Please return to the dashboard or contact your project lead.
            </p>
            <Link href="/" style={{
                padding: '12px 24px', background: 'var(--accent-blue)', color: '#fff',
                borderRadius: '12px', fontWeight: '800', textDecoration: 'none',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
            }}>
                Return to Safety
            </Link>
        </div>
    );
}
