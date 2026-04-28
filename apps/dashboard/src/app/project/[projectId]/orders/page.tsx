'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useParams } from 'next/navigation';
import { DiagnosticDrawer } from '@kpi-platform/ui';
import {
    Package,
    Clock,
    AlertTriangle,
    ShoppingBag,
    Activity,
    Search,
    ChevronRight,
    RefreshCw,
    Building2,
    FileText,
    AlertCircle,
    CheckCircle2,
    Truck,
} from 'lucide-react';

import { OrderDetailDrawerContent } from '../../../../components/orders/OrderDetailDrawerContent';

const pageStyle: React.CSSProperties = {
    padding: '24px 28px',
    maxWidth: '1280px',
    margin: '0 auto',
    display: 'block',
    overflow: 'visible',
};

const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    overflow: 'visible',
};

const cardStyle: React.CSSProperties = {
    borderRadius: '12px',
    border: '1px solid var(--border-card)',
    background: 'var(--bg-card)',
    padding: '24px',
    overflow: 'visible',
};

export default function OrdersPage() {
    const params = useParams();
    const projectId = params.projectId as string;
    const { token, apiFetch } = useAuth();

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>({
        totalOrders: 0,
        ordersThisHour: 0,
        onlineSplit: 0,
        offlineSplit: 0,
        delayedCount: 0,
        failedCount: 0,
        ordersPerMinute: '0.00',
    });
    const [orders, setOrders] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    const fetchData = useCallback(async () => {
        if (!token || !projectId) return;
        setLoading(true);
        setError(null);
        try {
            const [s, oList] = await Promise.all([
                apiFetch(`/api/v1/dashboard/orders/summary?siteId=${projectId}`),
                apiFetch(`/api/v1/dashboard/orders/list?siteId=${projectId}`),
            ]);
            setStats(s);
            setOrders(Array.isArray(oList) ? oList : []);
        } catch (e) {
            console.error('Failed to sync order intelligence:', e);
            setError('Failed to synchronize order intelligence. Please retry.');
        } finally {
            setLoading(false);
        }
    }, [projectId, token, apiFetch]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleInspect = (order: any) => {
        setSelectedOrder(order);
        setIsDrawerOpen(true);
    };

    const handleAction = async (action: string) => {
        console.log(`Action triggered for ${selectedOrder?.id}: ${action}`);
    };

    const filteredOrders = useMemo(() => {
        return orders.filter((o) => {
            const id = String(o.id || '').toLowerCase();
            const externalId = String(o.externalOrderId || '').toLowerCase();
            const query = searchQuery.toLowerCase();
            const matchesSearch = id.includes(query) || externalId.includes(query);
            const matchesStatus = !filterStatus || o.status === filterStatus;
            return matchesSearch && matchesStatus;
        });
    }, [orders, searchQuery, filterStatus]);

    const timeline = useMemo<any[]>(() => {
        if (!selectedOrder) return [];
        const events: any[] = [
            {
                title: 'Order Placed',
                time: 'Captured',
                system: selectedOrder.channel?.toUpperCase() || 'SOURCE',
                type: 'success',
            },
        ];
        if (['paid', 'shipped', 'delivered'].includes(selectedOrder.status)) {
            events.push({ title: 'Payment Validated', time: 'Processed', system: 'GATEWAY', type: 'success' });
        }
        if (selectedOrder.syncStatus === 'error') {
            events.push({
                title: 'Sync Failure',
                time: 'Recent',
                system: 'OMS-1',
                type: 'error',
                description: 'Internal processing error during synchronization.',
            });
        } else if (selectedOrder.syncStatus === 'synced') {
            events.push({ title: 'Unified State Sync', time: 'Success', system: 'CORE', type: 'success' });
        }
        return events.reverse();
    }, [selectedOrder]);

    const reconciliation = useMemo(() => {
        if (!selectedOrder) return [];
        return [
            {
                name: 'Storefront State',
                id: 'SOURCE_API',
                value: `$${selectedOrder.amount?.toFixed(2)}`,
                match: true,
                icon: <ShoppingBag size={14} />,
            },
            {
                name: 'OMS State',
                id: 'INTEGRATION_LAYER',
                value: `$${selectedOrder.amount?.toFixed(2)}`,
                match: selectedOrder.syncStatus !== 'mismatch',
                icon: <Building2 size={14} />,
            },
            {
                name: 'Financial Ledger',
                id: 'ERP_CORE',
                value: `$${selectedOrder.amount?.toFixed(2)}`,
                match: true,
                icon: <RefreshCw size={14} />,
            },
        ];
    }, [selectedOrder]);

    const statusColor = (status: string) => {
        switch ((status || '').toLowerCase()) {
            case 'shipped':
            case 'delivered':
            case 'paid':
                return { bg: 'var(--success-bg)', text: 'var(--success-text)' };
            case 'placed':
            case 'processing':
                return { bg: 'var(--info-bg)', text: 'var(--info-text)' };
            case 'cancelled':
            case 'failed':
                return { bg: 'var(--error-bg)', text: 'var(--error-text)' };
            default:
                return { bg: 'var(--bg-badge-active)', text: 'var(--text-muted)' };
        }
    };

    const healthColor = (health: string) => {
        if (health === 'healthy') return { bg: 'var(--success-bg)', text: 'var(--success-text)' };
        if (health === 'delayed') return { bg: 'var(--warning-bg)', text: 'var(--warning-text)' };
        return { bg: 'var(--error-bg)', text: 'var(--error-text)' };
    };

    if (loading && orders.length === 0) {
        return (
            <div style={{ ...pageStyle, ...sectionStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '9999px', border: '4px solid #1f2937', borderTopColor: '#3b82f6', marginBottom: '16px', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Loading Order Console…</span>
                </div>
            </div>
        );
    }

    return (
        <>
            <div style={{ ...pageStyle, ...sectionStyle, minHeight: '100vh', background: 'var(--bg-page)', color: 'var(--text-primary)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ maxWidth: '44rem', minWidth: 0 }}>
                        <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', fontSize: '20px', lineHeight: 1.25, fontWeight: 500, color: 'var(--text-primary)' }}>
                            <Package style={{ width: '20px', height: '20px', color: '#60a5fa', flexShrink: 0 }} />
                            <span>Order Operations Console</span>
                        </h1>
                        <p style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
                            Real-time oversight and intelligence for high-volume order flows.
                        </p>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
                        <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '8px', border: '1px solid var(--border-input)', background: 'var(--bg-input)', padding: '8px 16px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', flexShrink: 0, cursor: 'pointer' }}>
                            <RefreshCw style={{ width: '16px', height: '16px', flexShrink: 0, animation: loading ? 'spin 1s linear infinite' : undefined }} /> Refresh
                        </button>
                    </div>
                </div>

                {error && (
                    <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.1)', color: '#fb7185', overflow: 'visible' }}>
                        <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '12px' }}>
                            <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                            <span style={{ fontSize: '14px', overflowWrap: 'anywhere' }}>{error}</span>
                        </div>
                        <button onClick={fetchData} style={{ marginLeft: '8px', flexShrink: 0, fontSize: '14px', fontWeight: 500, textDecoration: 'underline', color: '#fb7185', cursor: 'pointer', background: 'transparent', border: 'none' }}>
                            Retry
                        </button>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '24px', overflow: 'visible' }}>
                    {[
                        { label: 'Total Orders', value: stats.totalOrders ?? 0, status: 'LIVE', context: 'Across channels', icon: ShoppingBag, statusBg: 'var(--success-bg)', statusColor: 'var(--success-text)' },
                        { label: 'Orders This Hour', value: stats.ordersThisHour ?? 0, status: 'FLOW', context: 'Current hour throughput', icon: Activity, statusBg: 'var(--info-bg)', statusColor: 'var(--info-text)' },
                        { label: 'Delayed Orders', value: stats.delayedCount ?? 0, status: 'SLA', context: 'Potential breach', icon: Clock, statusBg: 'var(--warning-bg)', statusColor: 'var(--warning-text)' },
                        { label: 'Critical Failures', value: stats.failedCount ?? 0, status: 'ALERT', context: 'Immediate review', icon: AlertTriangle, statusBg: 'var(--error-bg)', statusColor: 'var(--error-text)' },
                    ].map((metric) => (
                        <div key={metric.label} style={{ borderRadius: '12px', border: '1px solid var(--border-card)', background: 'var(--bg-card)', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px', overflow: 'visible' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{metric.label}</span>
                                <metric.icon style={{ width: '16px', height: '16px', flexShrink: 0, color: 'var(--text-label)' }} />
                            </div>
                            <div style={{ fontSize: '38px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1, padding: '8px 0', overflow: 'visible' }}>{metric.value}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
                                <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', flexShrink: 0, background: metric.statusBg, color: metric.statusColor }}>{metric.status}</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-label)', marginLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{metric.context}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={cardStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '12px', alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                            <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '16px', height: '16px', color: '#64748b' }} />
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search Order ID, Marketplace ID, or Customer..."
                                style={{ width: '100%', height: '40px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '0 12px 0 36px', fontSize: '14px' }}
                            />
                        </div>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            style={{ height: '40px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '0 12px', fontSize: '14px' }}
                        >
                            <option value="">All Statuses</option>
                            <option value="placed">Placed</option>
                            <option value="processing">Processing</option>
                            <option value="paid">Paid</option>
                            <option value="shipped">Shipped</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="failed">Failed</option>
                        </select>
                        <button
                            onClick={() => {
                                setFilterStatus('');
                                setSearchQuery('');
                            }}
                            style={{ height: '40px', borderRadius: '8px', border: '1px solid var(--border-card)', background: '#dee3ee', color: 'var(--text-primary)', padding: '0 14px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer' }}
                        >
                            Clear
                        </button>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '40px', borderRadius: '8px', border: '1px solid var(--border-card)', background: 'var(--bg-input)', color: 'var(--text-muted)', padding: '0 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                            <Truck style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                            {filteredOrders.length} visible
                        </div>
                    </div>
                </div>

                <div style={{ ...cardStyle, padding: '0' }}>
                    {filteredOrders.length === 0 ? (
                        <div style={{ minHeight: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
                            <CheckCircle2 style={{ width: '40px', height: '40px', color: '#10b981', marginBottom: '12px' }} />
                            <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>No Orders Matched</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Adjust search or status filters to broaden results.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr 0.8fr 0.8fr 1fr 0.7fr 0.6fr', padding: '12px 16px', borderBottom: '1px solid var(--border-card)', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
                                <span>Order Reference</span>
                                <span>Channel</span>
                                <span>Status</span>
                                <span>Health</span>
                                <span>Reconciliation</span>
                                <span style={{ textAlign: 'right' }}>Value</span>
                                <span style={{ textAlign: 'right' }}>Age</span>
                            </div>
                            {filteredOrders.map((o) => {
                                const status = statusColor(o.status || '');
                                const health = healthColor(o.health || '');
                                const syncError = o.syncStatus !== 'synced';
                                const diff = (Date.now() - new Date(o.createdAt).getTime()) / 60000;
                                return (
                                    <button
                                        key={o.id}
                                        onClick={() => handleInspect(o)}
                                        style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr 0.8fr 0.8fr 1fr 0.7fr 0.6fr', alignItems: 'center', gap: '8px', padding: '14px 16px', borderBottom: '1px solid var(--border-card)', background: 'transparent', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}
                                    >
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.id}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.externalOrderId}</div>
                                        </div>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                            <Activity style={{ width: '14px', height: '14px', flexShrink: 0, color: o.orderSource === 'online' ? '#60a5fa' : 'var(--text-muted)' }} />
                                            <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.orderSource || 'unknown'}</span>
                                        </div>
                                        <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', background: status.bg, color: status.text, width: 'fit-content' }}>{String(o.status || 'unknown').toUpperCase()}</span>
                                        <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', background: health.bg, color: health.text, width: 'fit-content' }}>{String(o.health || 'unknown').toUpperCase()}</span>
                                        <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', background: syncError ? 'var(--error-bg)' : 'var(--bg-badge-active)', color: syncError ? 'var(--error-text)' : 'var(--text-muted)', width: 'fit-content' }}>{String(o.syncStatus || 'unknown').toUpperCase()}</span>
                                        <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>${Number(o.amount || 0).toFixed(2)}</span>
                                        <span style={{ textAlign: 'right', fontSize: '11px', fontWeight: diff > 60 ? 700 : 500, color: diff > 60 ? '#f87171' : 'var(--text-muted)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                            <Clock style={{ width: '14px', height: '14px', flexShrink: 0 }} />
                                            {Math.floor(diff)}m
                                            <ChevronRight style={{ width: '14px', height: '14px', flexShrink: 0, color: 'var(--text-secondary)' }} />
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <DiagnosticDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                title="Order Details"
                subtitle={`Site: ${projectId} • Integrity: ${selectedOrder?.health === 'healthy' ? 'Verified' : 'Review Required'}`}
                width="600px"
            >
                <OrderDetailDrawerContent
                    order={selectedOrder}
                    timeline={timeline}
                    reconciliation={reconciliation}
                    onAction={handleAction}
                />
            </DiagnosticDrawer>
        </>
    );
}
