import { PlatformConfig } from '../models/config.model';

export class ConfigResolverService {
    
    /**
     * Recursively merges the payload objects to calculate the absolute 'truth' configuration.
     * Inheritance Strategy Mapping: Global Default -> Overridden closely by Tenant -> Overridden absolutely by isolated Site
     */
    static resolveConfig(globalConfig: Partial<PlatformConfig>, tenantConfig?: Partial<PlatformConfig>, siteConfig?: Partial<PlatformConfig>): PlatformConfig {
        
        const merged: any = { ...globalConfig };

        if (tenantConfig) {
            if (tenantConfig.tracking) merged.tracking = { ...merged.tracking, ...tenantConfig.tracking };
            if (tenantConfig.sampling) merged.sampling = { ...merged.sampling, ...tenantConfig.sampling };
            if (tenantConfig.thresholds) merged.thresholds = { ...merged.thresholds, ...tenantConfig.thresholds };
        }

        if (siteConfig) {
            if (siteConfig.tracking) merged.tracking = { ...merged.tracking, ...siteConfig.tracking };
            if (siteConfig.sampling) merged.sampling = { ...merged.sampling, ...siteConfig.sampling };
            if (siteConfig.thresholds) merged.thresholds = { ...merged.thresholds, ...siteConfig.thresholds };
        }

        return merged as PlatformConfig;
    }
}
