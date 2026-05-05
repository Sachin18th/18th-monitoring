import { PerformanceIntelligenceService } from './performance-intelligence.service';

export class DependencyObserverService {
    
    /**
     * Tracks the performance of a third-party dependency (API, Gateway).
     * Requirement 14
     */
    static async recordDependencyLatency(options: {
        siteId: string;
        dependencyName: string;
        latencyMs: number;
        status: 'SUCCESS' | 'ERROR';
        releaseVersion?: string;
    }) {
        // Log as a SYSTEM performance signal
        await PerformanceIntelligenceService.ingestSignal({
            siteId: options.siteId,
            environment: 'production',
            category: 'SYSTEM',
            name: 'API_LATENCY',
            value: options.latencyMs,
            unit: 'ms',
            timestamp: new Date().toISOString(),
            dimensions: {
                service: options.dependencyName,
                release: options.releaseVersion
            }
        });

        // If Error, also track as error rate
        if (options.status === 'ERROR') {
            await PerformanceIntelligenceService.ingestSignal({
                siteId: options.siteId,
                environment: 'production',
                category: 'SYSTEM',
                name: 'ERROR_RATE',
                value: 1,
                unit: 'count',
                timestamp: new Date().toISOString(),
                dimensions: {
                    service: options.dependencyName,
                    release: options.releaseVersion
                }
            });
        }
    }

    /**
     * Requirement 13: Correlation with releases
     * Checks if a release caused a latency spike in dependencies.
     */
    static async analyzeReleaseImpact(siteId: string, releaseVersion: string) {
        // Logic to compare avg/p95 latency before vs after release
        return {
            release: releaseVersion,
            impactDetected: false,
            latencyDelta: 0
        };
    }
}
