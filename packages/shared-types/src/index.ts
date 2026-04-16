export * from './config';
import { z } from 'zod';
import { BaseEventSchema, BrowserIngestPayloadSchema, ServerIngestPayloadSchema } from '../../events/src/schemas';

export type BaseEvent = z.infer<typeof BaseEventSchema>;
export type BrowserIngestPayload = z.infer<typeof BrowserIngestPayloadSchema>;
export type ServerIngestPayload = z.infer<typeof ServerIngestPayloadSchema>;

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'CUSTOMER';
export type UserStatus = 'active' | 'suspended' | 'inactive';
export type ProjectStatus = 'active' | 'maintenance' | 'archived';

export interface UserAudit {
    createdAt: string;
    lastLoginAt?: string;
    lastIp?: string;
    updatedAt: string;
}

export interface User {
    id: string;
    email: string;
    name: string;
    role: Role;
    status: UserStatus;
    passwordHash?: string; // Stored securely
    assignedProjects: string[]; // array of siteIds
    audit: UserAudit;
}

export interface Project {
    id: string; // siteId
    name: string;
    description?: string;
    status: ProjectStatus;
    organizationId?: string;
    lastActivity?: string;
    metricsSummary?: {
        activeUsers: number;
        errorRate: number;
        revenue?: number;
    };
}

export interface AuthSession {
    token: string;
    user: Omit<User, 'passwordHash'>;
    expiresAt: string;
}

export interface OrderEventMetadata {
    orderId: string;
    value?: number;
    source?: string;
    error?: string;
}

export interface PageViewMetadata {
    url: string;
    loadTime?: number;
}

export type OrderSource = 'online' | 'offline';
export type OrderStatus = 'placed' | 'processed' | 'shipped' | 'cancelled' | 'refunded';

export interface CanonicalOrder {
    orderId: string;
    externalOrderId?: string;
    tenantId: string;
    siteId: string;
    orderSource: OrderSource;
    sourceSystem: string;
    channel: string;
    orderType: string;
    status: OrderStatus;
    currency: string;
    amount: number;
    createdAt: string;
    updatedAt: string;
    metadata: Record<string, any>;
}
