export interface Tenant {
    tenantId: string;
    name: string;
    createdAt: string;
}

export interface SiteMetadata {
    siteId: string;
    tenantId: string;
    domain: string;
    status: 'active' | 'suspended';
    config: Record<string, any>; // JSON tracking config definitions
}
