import { z } from 'zod';
import { PlatformConfigSchema } from '../schemas/config.schema';

export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;

export type ConfigStatus = 'draft' | 'active' | 'archived';

export interface ConfigDocument {
    versionId: string;
    targetLevel: 'global' | 'tenant' | 'site';
    targetId: string; // Resolves exactly mapped to an overarching tenantId or strict unique siteId
    config: Partial<PlatformConfig>;
    status: ConfigStatus;
    createdAt: string;
    updatedAt: string;
    updatedBy: string; // Capturing precise Admin User IDs for strict Audit trails
<<<<<<< HEAD
}
=======
}
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
