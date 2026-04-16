import * as fs from 'fs';
import * as path from 'path';

export interface AppConfig {
    tracking: {
        performance: boolean;
        user: boolean;
        errors: boolean;
    };
    sampling: {
        sessionRate: number;
    };
    thresholds: {
        pageLoadMs: number;
        errorRatePct: number;
        orderDelayMin: number;
    };
}

export class ConfigResolver {
    private configPath: string;

    constructor(configPath: string = path.join(__dirname, '..')) {
        this.configPath = configPath;
    }

    private loadJSON(filename: string): any {
        const filePath = path.join(this.configPath, filename);
        if (fs.existsSync(filePath)) {
            try {
                let content = fs.readFileSync(filePath, 'utf-8');
                // Strip BOM if present
                if (content.charCodeAt(0) === 0xFEFF) {
                    content = content.slice(1);
                }
                return JSON.parse(content);
            } catch (e) {
                console.error(`[ConfigResolver] Failed to parse ${filename}:`, e);
            }
        }
        return {};
    }

    public resolve(siteId: string): AppConfig {
        const globalDefault = this.loadJSON('global-default.json');
        const tracking = this.loadJSON('tracking.json');
        const thresholds = this.loadJSON('thresholds.json');
        
        // Site specific override
        const siteOverride = this.loadJSON(`site_${siteId}.json`);

        return {
            tracking: { 
                performance: true, user: true, errors: true, 
                ...globalDefault.tracking, ...tracking.tracking, ...siteOverride.tracking 
            },
            sampling: { 
                sessionRate: 1.0, 
                ...globalDefault.sampling, ...tracking.sampling, ...siteOverride.sampling 
            },
            thresholds: { 
                pageLoadMs: 3000, errorRatePct: 2.0, orderDelayMin: 30,
                ...globalDefault.thresholds, ...thresholds.thresholds, ...siteOverride.thresholds 
            }
        };
    }
}
