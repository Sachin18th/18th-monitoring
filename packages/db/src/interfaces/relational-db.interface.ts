import { Tenant, SiteMetadata } from '../models/tenant.model';

/**
 * Repository interface mapping strictly relational/ACID required data.
 * Consumed by: Config Manager, Alert Engine, Dashboard, and Ingestion APIs.
 */
export interface RelationalRepository {
    // Tenant & Config
    getTenant(tenantId: string): Promise<Tenant | null>;
    getSiteMetadata(siteId: string): Promise<SiteMetadata | null>;
    updateSiteConfig(siteId: string, config: any): Promise<void>;

    // Alerts
    getAlertRules(siteId: string): Promise<any[]>;
    saveAlertState(alert: any): Promise<void>;

    // User Management
    getUsersByProject(projectId: string): Promise<any[]>;
    createUser(user: any): Promise<void>;
    updateUser(userId: string, updates: any): Promise<void>;
}
