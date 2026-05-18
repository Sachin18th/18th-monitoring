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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresAdapter = exports.db = void 0;
const postgres_js_1 = require("drizzle-orm/postgres-js");
const postgres_1 = __importDefault(require("postgres"));
const schema = __importStar(require("../drizzle/schema"));
// Mock DB for local scripts/simulations when DATABASE_URL is missing
// In production, this uses the real postgres connection
const connectionString = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/db';
// For simulation/CI, we often want to mock the 'db' object to avoid actual connection attempts.
// Here we provide a structural mock if we are in verification mode.
const isVerification = process.env.VERIFICATION_MODE === 'true';
let dbInstance;
if (isVerification) {
    dbInstance = {
        insert: () => ({ values: () => Promise.resolve() }),
        update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
        delete: () => ({ where: () => Promise.resolve() }),
        select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
        transaction: (cb) => cb({
            insert: () => ({ values: () => Promise.resolve() }),
            update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
            select: () => ({ from: () => ({
                    where: () => ({
                        orderBy: () => ({
                            limit: () => Promise.resolve([])
                        })
                    })
                }) }),
        })
    };
}
else {
    // Real implementation (requires 'postgres' and 'drizzle-orm' pkgs)
    const client = (0, postgres_1.default)(connectionString);
    dbInstance = (0, postgres_js_1.drizzle)(client, { schema });
}
exports.db = dbInstance;
/**
 * Legacy PostgresAdapter (Phase 1/2) - for backwards compatibility
 * with existing interfaces.
 */
class PostgresAdapter {
    async updateSiteConfig(siteId, config) {
        console.log(`[PostgresAdapter] Updated master configuration for ${siteId}`);
    }
}
exports.PostgresAdapter = PostgresAdapter;
