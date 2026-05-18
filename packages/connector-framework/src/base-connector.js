"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseConnector = void 0;
/**
 * Base abstract class for all connectors.
 * Enforces the formal lifecycle contract defined in Phase 3.
 */
class BaseConnector {
    /**
     * Webhook intake logic.
     */
    async handleWebhook(payload, headers, config) {
        throw new Error('Webhooks not supported by this connector');
    }
    /**
     * Validates that an inbound webhook actually came from the expected source.
     */
    async validateWebhookSignature(payload, headers, config) {
        // Default implementation: assume valid if not explicitly checked
        return true;
    }
    /**
     * Retrieves the transformation mapping template for a given entity type for this connector.
     */
    getMappingTemplate(entityType) {
        return null;
    }
}
exports.BaseConnector = BaseConnector;
