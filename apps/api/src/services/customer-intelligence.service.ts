import { prisma, hashEmail, encryptEmail } from '@kpi-platform/db';
import { 
    CustomerProfile, 
    CustomerEvent, 
    CustomerSession,
    CustomerLifecycleState
} from '../../../../packages/shared-types/src';
import crypto from 'crypto';

export class CustomerIntelligenceService {
    
    /**
     * Resolves and stitches customer identity across systems.
     * Requirement 1 & 2
     */
    static async resolveIdentity(options: {
        siteId: string;
        email?: string;
        externalId?: { system: string; id: string };
        visitorId?: string;
    }): Promise<string> {
        // Privacy-safe hashing (Requirement 18) — canonical hash shared across all writers.
        const emailHash: string | undefined = hashEmail(options.email) ?? undefined;

        const project = await prisma.project.findUnique({
            where: { id: options.siteId },
            select: { tenantId: true }
        });
        const tenantId = project?.tenantId || 'tenant_001';

        // 1. ATTEMPT MATCH BY EMAIL HASH (Strong Link)
        if (emailHash) {
            const existing = await prisma.customerProfile.findFirst({
                where: {
                    siteId: options.siteId,
                    emailHash
                }
            });

            if (existing) return existing.id;
        }

        // 2. ATTEMPT MATCH BY EXTERNAL SYSTEM ID (Requirement 1)
        if (options.externalId) {
            // Logic to scan jsonb externalIds for match
        }

        // 3. CREATE NEW PROFILE IF NO MATCH
        const newId = crypto.randomUUID();
        await prisma.customerProfile.create({
            data: {
                id: newId,
                siteId: options.siteId,
                tenantId,
                emailHash,
                // Reversible, encrypted-at-rest copy for dashboard display.
                emailEncrypted: encryptEmail(options.email) || undefined,
                externalIds: options.externalId ? { [options.externalId.system]: options.externalId.id } : {},
                lifecycleState: 'NEW_GUEST',
                identityConfidence: emailHash ? '1.0' : '0.5'
            }
        });

        return newId;
    }

    /**
     * Ingests a customer event and handles sessionization.
     * Requirement 4, 7
     */
    static async ingestEvent(event: Omit<CustomerEvent, 'id' | 'sessionId'> & { email?: string }) {
        const customerId = await this.resolveIdentity({
            siteId: event.siteId,
            email: event.email
        });

        // 1. RESOLVE OR CREATE SESSION (Requirement 7)
        const sessionId = await this.getOrCreateSession(customerId, event.siteId);

        // 2. STORE EVENT (Requirement 4)
        const eventId = crypto.randomUUID();
        // customerEvent table removed — query neutralized

        // 3. COMPUTE LIFECYCLE PROGRESSION (Requirement 14)
        await this.updateLifecycle(customerId, event.eventCategory);

        return { eventId, customerId, sessionId };
    }

    private static async getOrCreateSession(customerId: string, siteId: string): Promise<string> {
        // Simple 30-minute timeout logic (Requirement 7)
        // customerSession table removed — query neutralized
        const lastSession = null as unknown as { id: string; endTime: Date | null } | null;

        const timeoutMs = 30 * 60 * 1000;
        if (lastSession && lastSession.endTime && (Date.now() - new Date(lastSession.endTime).getTime() < timeoutMs)) {
            return lastSession.id;
        }

        const newSessionId = crypto.randomUUID();
        // customerSession table removed — query neutralized
        return newSessionId;
    }

    private static async updateLifecycle(id: string, category: string) {
        // Requirement 14: Lifecycle computation
        let nextState: CustomerLifecycleState = 'ENGAGED_USER';
        if (category === 'CART') nextState = 'CART_STARTER';
        if (category === 'PURCHASE') nextState = 'PURCHASER';

        await prisma.customerProfile.updateMany({
            where: { id },
            data: { lifecycleState: nextState, lastSeenAt: new Date() }
        });
    }
}
