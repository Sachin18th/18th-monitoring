export interface Tenant {
    id: string; // UUID
    name: string;
    slug: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
    plan: 'FREE' | 'PRO' | 'ENTERPRISE';
    settings: Record<string, any>;
    createdAt: string;
    updatedAt: string;
}

export interface SiteMetadata {
    siteId: string;
    tenantId: string;
    domain: string;
    status: 'active' | 'suspended';
    config: Record<string, any>; // JSON tracking config definitions
}
