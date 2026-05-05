<<<<<<< HEAD
export interface MetricRecord {
    id?: string;
    siteId: string;
    tenantId?: string;
=======
﻿export interface MetricRecord {
    siteId: string;
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
    timestamp: string;
    kpiName: string;
    value: number;
    dimensions: Record<string, string>;
<<<<<<< HEAD
    timeWindow?: string;
    freshnessStatus?: 'live' | 'stale' | 'replaying';
    lastUpdated?: string;
    _dimHash?: string;
=======
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
}
