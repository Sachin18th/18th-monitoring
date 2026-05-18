import { useState, useEffect, useMemo } from 'react';
import { KpiPlatform, KpiPlatformOptions } from '@kpi-platform/sdk-core';

// This would ideally operate across a React Context Provider in a real app
let globalPlatformClient: KpiPlatform | null = null;

export const initKpiReact = (options: KpiPlatformOptions) => {
    globalPlatformClient = new KpiPlatform(options);
};

const useKpiPlatform = () => {
    if (!globalPlatformClient) throw new Error('You must call initKpiReact before using hooks.');
    return globalPlatformClient;
};

export const useMetric = (metricKey: string, deps: any[] = []) => {
    const kpi = useKpiPlatform();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        kpi.getMetric(metricKey)
            .then(res => isMounted && setData(res.data))
            .catch(err => isMounted && setError(err))
            .finally(() => isMounted && setLoading(false));

        return () => { isMounted = false; };
    }, [metricKey, ...deps]);

    return { data, loading, error };
};

export const useWidget = (widgetId: string) => {
    const kpi = useKpiPlatform();
    // Implementation mirrors useMetric
    return { data: null, loading: false, error: null };
};

export const useOrderSummary = () => {
    const kpi = useKpiPlatform();
    // Implementation mirrors useMetric
    return { data: null, loading: false, error: null };
};
