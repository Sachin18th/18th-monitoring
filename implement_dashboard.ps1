$basePath = "c:\kpi monitoring"
cd $basePath

function Write-File {
    param([string]$Path, [string]$Content)
    $dir = Split-Path $Path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Set-Content -LiteralPath $Path -Value  $Content.Trim()
}

# ---------------------------------------------
# BACKEND API
# ---------------------------------------------

Write-File "apps/api/src/middlewares/auth.middleware.ts" @"
export const tenantAuthHandler = (req: any, res: any, next: any) => {
    // TODO: Verify JWT token mappings from HTTP Headers
    // TODO: Assign req.tenantId and req.siteId based on strict domain validation
    // TODO: Implement RBAC ensuring admin dashboards are shielded
    req.tenantId = 'tenant_001';
    req.siteId = 'store_001';
    next();
};
"@

Write-File "apps/api/src/models/dashboard.dto.ts" @"
export interface KpiSummaryResponse {
    kpiName: string;
    value: number;
    trendPct: number;
    state: 'healthy' | 'warning' | 'critical';
}

export interface MetricFilterDto {
    siteId: string;
    timeRange: '1h' | '24h' | '7d';
    region?: string;
    source?: string;
}

export interface AlertSummaryResponse {
    alertId: string;
    kpiName: string;
    severity: string;
    status: string;
    message: string;
    triggeredAt: string;
}
"@

Write-File "apps/api/src/services/dashboard.service.ts" @"
import { MetricFilterDto, KpiSummaryResponse, AlertSummaryResponse } from '../models/dashboard.dto';

export class DashboardService {

    // TODO: Import standard Interface TimeSeriesRepository retrieving DB calculations
    static async getKpiSummaries(filters: MetricFilterDto): Promise<KpiSummaryResponse[]> {
        return [
            { kpiName: 'pageLoadTime', value: 1250, trendPct: -5, state: 'healthy' },
            { kpiName: 'errorRatePct', value: 2.1, trendPct: 15, state: 'warning' },
            { kpiName: 'ordersDelayCount', value: 0, trendPct: 0, state: 'healthy' }
        ];
    }

    // TODO: Evaluate RelationalRepository for Active Incident reports
    static async getActiveAlerts(filters: MetricFilterDto): Promise<AlertSummaryResponse[]> {
        return [
            {
                alertId: 'alt_991',
                kpiName: 'errorRatePct',
                severity: 'high',
                status: 'active',
                message: 'Error rate > threshold',
                triggeredAt: new Date().toISOString()
            }
        ];
    }

    // TODO: Query EventStoreRepository pulling specific log trails
    static async getRealtimeMetricsStream(filters: MetricFilterDto): Promise<any> {
        // Exposes polling mappings prior to WebSocket upgrade hooks
        return [];
    }
}
"@

Write-File "apps/api/src/controllers/dashboard.controller.ts" @"
import { DashboardService } from '../services/dashboard.service';

export const getSummaries = async (req: any, res: any) => {
    try {
        const filters = { siteId: req.siteId, timeRange: req.query.timeRange || '1h' };
        
        const data = await DashboardService.getKpiSummaries(filters as any);
        return res.status(200).json(data);

    } catch (err) {
        console.error('[DashboardController] Routing failure', err);
        return res.status(500).json({ error: 'Internal API Server Error' });
    }
};

export const getAlerts = async (req: any, res: any) => {
    try {
        const filters = { siteId: req.siteId, timeRange: req.query.timeRange || '24h' };
        
        const data = await DashboardService.getActiveAlerts(filters as any);
        return res.status(200).json(data);

    } catch (err) {
        return res.status(500).json({ error: 'Internal API Server Error' });
    }
};
"@

Write-File "apps/api/src/routes/dashboard.ts" @"
import { getSummaries, getAlerts } from '../controllers/dashboard.controller';
import { tenantAuthHandler } from '../middlewares/auth.middleware';

export const dashboardRoutes = (router: any) => {
    // API Prefix Mapping
    // Securely routes all data strictly mapped to authenticated tenants bounds
    router.use('/api/v1/dashboard', tenantAuthHandler);
    
    router.get('/api/v1/dashboard/summaries', getSummaries);
    router.get('/api/v1/dashboard/alerts', getAlerts);
    
    // TODO: Create detail lookup hooks (e.g. GET /alerts/:id) and configuration mutations
};
"@

# ---------------------------------------------
# FRONTEND DASHBOARD
# ---------------------------------------------

Write-File "apps/dashboard/package.json" @"
{
  "name": "dashboard",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "latest",
    "react": "latest",
    "react-dom": "latest"
  }
}
"@

Write-File "apps/dashboard/src/components/ui/MetricCard.tsx" @"
import React from 'react';

export const MetricCard = ({ title, value, state }: any) => (
    <div className={`metric-card border p-4 rounded-lg shadow-sm \${state === 'critical' || state === 'warning' ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
        <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
        <p className="text-2xl font-bold mt-1">{value}</p>
        <span className="text-xs uppercase font-semibold text-gray-400 mt-2 block">{state}</span>
        {/* TODO: Attach Recharts micro-sparkline block displaying trends */}
    </div>
);
"@

Write-File "apps/dashboard/src/components/ui/StatusBadge.tsx" @"
import React from 'react';

export const StatusBadge = ({ severity }: any) => {
    // TODO: Embed structured Tailwind maps strictly handling dynamic severity colors
    return <span className="px-2 py-1 text-xs font-semibold rounded block border border-red-300 bg-red-100 text-red-800 text-center uppercase">{severity}</span>;
};
"@

Write-File "apps/dashboard/src/components/ui/FilterBar.tsx" @"
import React from 'react';

export const FilterBar = () => (
    <div className="filter-bar flex flex-wrap gap-4 p-4 border-b bg-gray-50 items-center justify-between">
        <div className="flex gap-4">
            {/* TODO: Add React state logic evaluating Context bounds dynamically */}
            <select className="border rounded p-2 bg-white"><option>Last 1 Hour</option></select>
            <select className="border rounded p-2 bg-white"><option>Global</option></select>
            <select className="border rounded p-2 bg-white"><option>All Sources</option></select>
        </div>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded transition">Apply Filters</button>
    </div>
);
"@

Write-File "apps/dashboard/src/components/layout/Sidebar.tsx" @"
import React from 'react';

export const Sidebar = () => (
    <nav className="w-64 border-r h-screen p-4 flex flex-col gap-2 bg-gray-50 text-gray-800">
        <div className="font-extrabold text-lg mb-6 border-b pb-4 text-blue-600">KPI Monitor</div>
        <a href="/" className="hover:bg-gray-200 p-2 rounded transition">Overview</a>
        <a href="/performance" className="hover:bg-gray-200 p-2 rounded transition">Performance</a>
        <a href="/users" className="hover:bg-gray-200 p-2 rounded transition">User Metrics</a>
        <a href="/orders" className="hover:bg-gray-200 p-2 rounded transition">Order Funnel</a>
        <a href="/integrations" className="hover:bg-gray-200 p-2 rounded transition">Integration Health</a>
        <div className="flex-1"></div>
        <a href="/alerts" className="text-red-600 font-bold hover:bg-red-50 p-2 rounded transition flex justify-between">Alerts <span>(1)</span></a>
    </nav>
);
"@

Write-File "apps/dashboard/src/app/layout.tsx" @"
import { Sidebar } from '../components/layout/Sidebar';
import { FilterBar } from '../components/ui/FilterBar';

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body className="flex h-screen overflow-hidden antialiased bg-gray-100">
                <Sidebar />
                <div className="flex-1 flex flex-col bg-white shadow-sm m-2 rounded-xl overflow-hidden border">
                    {/* TODO: Wrap with robust AuthContext handling security scopes */}
                    <FilterBar />
                    <main className="p-8 overflow-y-auto w-full h-full">{children}</main>
                </div>
            </body>
        </html>
    );
}
"@

Write-File "apps/dashboard/src/app/page.tsx" @"
import { MetricCard } from '../components/ui/MetricCard';

export default function OverviewDashboard() {
    return (
        <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">System Overview</h1>
                {/* TODO: Dashboard-level export or sharing controls */}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard title="Page Load Avg" value="1.2s" state="healthy" />
                <MetricCard title="Error Rate" value="2.1%" state="warning" />
                <MetricCard title="Active Users" value="1,245" state="healthy" />
                <MetricCard title="Delayed Orders" value="0" state="healthy" />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
                <div className="border border-gray-200 p-6 rounded-lg bg-gray-50 h-64 flex flex-col justify-center items-center text-gray-400">
                    {/* TODO: Hook Recharts plotting TimeSeries database trends here */}
                    <span>[ Primary Metrics Chart Placeholder ]</span>
                </div>
                <div className="border border-gray-200 p-6 rounded-lg bg-gray-50 h-64 flex flex-col justify-center items-center text-gray-400">
                    <span>[ Live Anomalies Tracker Placeholder ]</span>
                </div>
            </div>
        </div>
    );
}
"@

Write-File "apps/dashboard/src/app/performance/page.tsx" @"
export default function PerformanceView() {
    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Performance Metrics</h1>
            <p className="text-gray-500 mb-8">Granular drill-downs capturing Web Vitals mapping and regional differences.</p>
            {/* TODO: Separate grids detailing structured metrics mapping TTFB, FCP, LCP averages */}
            {/* TODO: Insert mapping chart visualising regional latencies */}
        </div>
    );
}
"@

Write-File "apps/dashboard/src/app/orders/page.tsx" @"
export default function OrdersView() {
    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Order Lifecycle Mappings</h1>
            <p className="text-gray-500 mb-8">Evaluating order drop-offs scaling against tracking definitions.</p>
            {/* TODO: Render Funnel components representing 'Placed' vs 'Processed' drops */}
        </div>
    );
}
"@

Write-File "apps/dashboard/src/app/users/page.tsx" @"
export default function UsersView() {
    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">User Activity Constraints</h1>
            {/* TODO: Live tables capturing raw Session trajectories */}
        </div>
    );
}
"@

Write-File "apps/dashboard/src/app/integrations/page.tsx" @"
export default function IntegrationsView() {
    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Integration Latencies (OMS)</h1>
            {/* TODO: Dashboard widgets showing ping failures scaling */}
        </div>
    );
}
"@


Write-File "apps/dashboard/src/app/alerts/page.tsx" @"
import { StatusBadge } from '../../components/ui/StatusBadge';

export default function AlertsView() {
    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Active Platform Alerts</h1>
            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                        <tr>
                            <th className="px-6 py-3 border-b">Severity</th>
                            <th className="px-6 py-3 border-b">Triggered KPI</th>
                            <th className="px-6 py-3 border-b">Description</th>
                            <th className="px-6 py-3 border-b">Timestamp</th>
                            <th className="px-6 py-3 border-b">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        <tr className="hover:bg-gray-50 transition border-b">
                            <td className="px-6 py-4"><StatusBadge severity="high" /></td>
                            <td className="px-6 py-4 font-medium">errorRatePct</td>
                            <td className="px-6 py-4">Error rate exceeded configured 2% threshold securely</td>
                            <td className="px-6 py-4 text-gray-500">10 mins ago</td>
                            <td className="px-6 py-4">
                                {/* TODO: Pass mapped ID to Drilldown */}
                                <a href="/alerts/alt_991" className="text-blue-600 hover:text-blue-800 hover:underline">Inspect Rules</a>
                            </td>
                        </tr>
                        {/* TODO: Map dynamic rendering from AlertList hooks here */}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
"@

Write-File "apps/dashboard/src/app/alerts/[id]/page.tsx" @"
export default function AlertDetailView() {
    return (
        <div>
            <div className="mb-4">
                <a href="/alerts" className="text-blue-500 text-sm hover:underline">← Back to Alerts Map</a>
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Alert Drill-down Analysis</h1>
            
            <div className="bg-gray-50 border p-6 rounded mb-8">
                <h3 className="font-bold text-lg mb-2">Technical Context payload constraint</h3>
                {/* TODO: Render context JSON parsing EventStore logging matches natively */}
                <pre className="bg-gray-800 text-gray-100 p-4 rounded text-xs mt-4">
                    {`{\n  "ruleId": "rule_error_rate_01",\n  "triggerValue": 2.1,\n  "thresholdValue": 2.0\n}`}
                </pre>
            </div>

            <div className="flex gap-4">
                {/* TODO: Tie Acknowledgements against the internal Postgres tracking module */}
                <button className="px-6 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition">Acknowledge</button>
                <button className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition">Mark Resolved</button>
            </div>
        </div>
    );
}
"@
