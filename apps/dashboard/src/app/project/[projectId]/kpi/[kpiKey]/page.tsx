'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../../context/AuthContext';
import { PageLayout, Card, Typography, OperationalTable, Column, TimeRangeSelector, TimeRangeValue, FreshnessIndicator, Badge } from '@kpi-platform/ui';
import { BarChart3, Activity, ArrowLeft } from 'lucide-react';
import { PerformanceChart } from '../../../../../components/ui/PerformanceChart';

export default function KpiDrillDownPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.projectId as string;
    const kpiKey = params.kpiKey as string;
    const { token, apiFetch } = useAuth();

    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<TimeRangeValue>('30d');
    const [kpiData, setKpiData] = useState<any>(null);
    const [seriesData, setSeriesData] = useState<any[]>([]);

    const loadData = useCallback(async () => {
        if (!token || !projectId || !kpiKey) return;
        setLoading(true);
        try {
            // Load KPI current value & metadata
            const summaryRes = await apiFetch(`/api/v1/tenants/current/projects/${projectId}/kpi/summary`);
            const kpiMatch = summaryRes?.data?.kpis?.find((k: any) => k.key === kpiKey);
            setKpiData(kpiMatch || { key: kpiKey, name: kpiKey, value: 0, freshnessStatus: 'unavailable' });

            // Load KPI time series
            const seriesRes = await apiFetch(`/api/v1/tenants/current/projects/${projectId}/kpi/${kpiKey}/series?range=${timeRange}`);
            setSeriesData(seriesRes?.data?.series || []);
        } catch (err) {
            console.error('Failed to load KPI detail:', err);
        } finally {
            setLoading(false);
        }
    }, [projectId, kpiKey, token, timeRange, apiFetch]);

    useEffect(() => { loadData(); }, [loadData]);

    const dimensionColumns: Column<any>[] = [
        { key: 'timestamp', header: 'Snapshot Time', render: (val) => new Date(val).toLocaleString() },
        { key: 'value', header: 'Value', render: (val) => <span className="font-mono font-bold">{typeof val === 'number' ? val.toLocaleString() : val}</span> },
        { key: 'formula', header: 'Computation', render: (val) => <Badge variant="neutral" size="sm" className="font-mono lowercase">{val}</Badge> }
    ];

    return (
        <PageLayout
            title={kpiData?.name || kpiKey}
            subtitle={kpiData?.description || 'Metric drill-down, historical series, and dimensional analysis.'}
            icon={<BarChart3 size={24} />}
            actions={
                <div className="flex items-center gap-4">
                    <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
                    <button 
                        onClick={() => router.back()}
                        className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-border/50 text-text-primary rounded-lg font-bold text-sm transition-colors"
                    >
                        <ArrowLeft size={16} /> Back
                    </button>
                </div>
            }
        >
            <div className="space-y-6">
                {/* 1. Header Hero Card */}
                <Card padding="lg" className="border-l-4 border-l-primary flex justify-between items-center bg-gradient-to-r from-primary/5 to-transparent">
                    <div>
                        <Typography variant="overline" className="text-text-muted">Current Value</Typography>
                        <Typography variant="h1" weight="black" className="text-5xl mt-1 tracking-tighter" noMargin>
                            {loading ? '...' : (typeof kpiData?.value === 'number' ? kpiData.value.toLocaleString() : kpiData?.value)}
                        </Typography>
                    </div>
                    <div className="text-right flex flex-col items-end">
                        <Typography variant="overline" className="text-text-muted mb-2 block">Data Trust Metric</Typography>
                        <FreshnessIndicator 
                            status={kpiData?.freshnessStatus || 'unavailable'} 
                            lastUpdated={kpiData?.lastUpdated}
                            size="md"
                        />
                    </div>
                </Card>

                {/* 2. Time Series Chart */}
                <Card>
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Activity size={18} className="text-primary" />
                            <Typography variant="h4" noMargin>Historical Trend</Typography>
                        </div>
                    </div>
                    <div className="h-[300px] w-full">
                        {loading && seriesData.length === 0 ? (
                            <div className="w-full h-full flex items-center justify-center bg-muted/20 animate-pulse rounded-xl" />
                        ) : seriesData.length === 0 ? (
                            <div className="w-full h-full flex flex-col items-center justify-center opacity-50">
                                <Activity size={32} className="text-text-muted mb-2" />
                                <Typography variant="caption">No historical data recorded for this timeframe.</Typography>
                            </div>
                        ) : (
                            <PerformanceChart data={seriesData} title="" />
                        )}
                    </div>
                </Card>

                {/* 3. Dimensional Breakdown / Raw Log */}
                <Card padding="none">
                    <div className="px-6 py-4 border-b border-border bg-muted/10">
                        <Typography variant="h4" noMargin>Computation Log</Typography>
                        <Typography variant="caption" className="text-text-muted">Recent aggregation events for traceability.</Typography>
                    </div>
                    <OperationalTable 
                        data={seriesData.slice().reverse()} 
                        columns={dimensionColumns}
                        loading={loading}
                        isDense
                    />
                </Card>
            </div>
        </PageLayout>
    );
}
