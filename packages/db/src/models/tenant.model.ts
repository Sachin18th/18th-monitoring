<<<<<<< HEAD
export interface Tenant {
    id: string; // UUID
    name: string;
    slug: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
    plan: 'FREE' | 'PRO' | 'ENTERPRISE';
    settings: Record<string, any>;
    createdAt: string;
    updatedAt: string;
=======
﻿export interface Tenant {
    tenantId: string;
    name: string;
    createdAt: string;
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
}

export interface SiteMetadata {
    siteId: string;
    tenantId: string;
    domain: string;
    status: 'active' | 'suspended';
    config: Record<string, any>; // JSON tracking config definitions
<<<<<<< HEAD
}
=======
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
