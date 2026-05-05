"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigResolver = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ConfigResolver {
    configPath;
    constructor(configPath = path.join(__dirname, '..')) {
        this.configPath = configPath;
    }
    loadJSON(filename) {
        const filePath = path.join(this.configPath, filename);
        if (fs.existsSync(filePath)) {
            try {
                let content = fs.readFileSync(filePath, 'utf-8');
                // Strip BOM if present
                if (content.charCodeAt(0) === 0xFEFF) {
                    content = content.slice(1);
                }
                return JSON.parse(content);
            }
            catch (e) {
                console.error(`[ConfigResolver] Failed to parse ${filename}:`, e);
            }
        }
        return {};
    }
    resolve(siteId) {
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
exports.ConfigResolver = ConfigResolver;
