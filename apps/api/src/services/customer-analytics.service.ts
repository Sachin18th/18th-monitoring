import { prisma } from '@kpi-platform/db';

export class CustomerAnalyticsService {
    
    /**
     * Requirement 11: Cohort Modeling
     * Fetches customers acquired within a specific date range (First Seen).
     */
    static async getAcquisitionCohort(siteId: string, startDate: Date, endDate: Date) {
        return prisma.customerProfile.findMany({
            where: {
                siteId,
                firstSeenAt: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });
    }

    /**
     * Requirement 12: Attribution Analysis
     * Calculates the most effective traffic sources based on conversion (Sessions with isConverted=1).
     */
    static async getTrafficSourcePerformance(siteId: string) {
        // customerSession table removed — query neutralized
        const sessions: Array<{ trafficSource: string | null; isConverted: number | null }> = [];

        const buckets = new Map<string, { totalSessions: number; conversions: number }>();

        for (const session of sessions) {
            const source = session.trafficSource || 'unknown';
            const bucket = buckets.get(source) || { totalSessions: 0, conversions: 0 };
            bucket.totalSessions += 1;
            bucket.conversions += session.isConverted || 0;
            buckets.set(source, bucket);
        }

        return Array.from(buckets.entries())
            .map(([source, bucket]) => ({
                source,
                totalSessions: bucket.totalSessions,
                conversions: bucket.conversions,
                conversionRate: bucket.totalSessions > 0 ? bucket.conversions / bucket.totalSessions : 0
            }))
            .sort((left, right) => right.conversions - left.conversions);
    }

    /**
     * Requirement 10: Segmentation Engine
     * Example: segmenting 'High Value' customers (e.g. repeat purchasers).
     */
    static async getHighValueSegments(siteId: string) {
        return prisma.customerProfile.findMany({
            where: {
                siteId,
                lifecycleState: 'REPEAT_PURCHASER'
            }
        });
    }
}
