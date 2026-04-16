import { ConfigDocument, ConfigStatus } from '../models/config.model';

export interface ConfigRepository {
    // Interfacing with fundamental PostgreSQL storage abstractions pulling versions directly
    getConfigTarget(targetLevel: 'global' | 'tenant' | 'site', targetId: string, status: ConfigStatus): Promise<ConfigDocument | null>;
    saveConfig(doc: ConfigDocument): Promise<void>;
    updateStatus(versionId: string, status: ConfigStatus): Promise<void>;
    
    // Future implementations tying: Rollback tracking, auditing diffs between versions
}
