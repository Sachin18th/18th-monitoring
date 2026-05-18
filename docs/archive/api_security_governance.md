# API Security & Governance Standards

This document outlines the security architecture and governance policies applied to the Monitoring Platform API Exposure Layer.

## 1. Authentication
All external requests must use **API Key Authentication**.
- **Keys**: Format `[prefix].[secret]`.
- **Storage**: Secrets are hashed using `scrypt` with a unique salt. Plaintext secrets are never stored.
- **Rotation**: Keys should be rotated every 90 days.
- **Exposure**: API secrets are displayed only once upon creation.

## 2. Authorization (Least Privilege)
Access is controlled via granular **scopes** and **tenant isolation**.
- **Tenants**: Data is strictly isolated by `siteId`. Keys can only access projects they are assigned to.
- **Scopes**: 
    - `reporting`: Overview and basic KPIs.
    - `performance`: Latency and RUM data.
    - `orders`: Order lifecycle and business metrics.
    - `customers`: Audience intelligence.
    - `integrations`: Connector health.
    - `admin`: Governance and configuration.

## 3. Rate Limiting & Quotas
To ensure platform reliability, tiered rate limiting is enforced:
- **Standard Tier**: 100 requests per minute.
- **VIP Tier**: 5,000 requests per minute.
- **Quotas**: Daily and monthly volume quotas are tracked via the `GovernanceService`.

### Headers
Every response includes:
- `X-RateLimit-Limit`: Maximum requests allowed in the window.
- `X-RateLimit-Remaining`: Requests remaining in the current window.
- `X-RateLimit-Reset`: Time (Unix seconds) when the window resets.

## 4. Abuse Protection
The platform includes automated abuse detection mechanisms:
- **Anomaly Detection**: API keys with abnormal error rates (>10% over 500 requests) are automatically suspended.
- **Replay Protection**: Idempotency keys (`X-Idempotency-Key`) are required for all non-safe (`POST`, `PATCH`, `DELETE`) operations.
- **IP Restrictions**: Keys can be locked to specific CIDR ranges (Whitelisting).

## 5. Audit Logging
Every interaction is logged for compliance and traceability:
- **General Access**: All calls are tracked by `traceId`, `keyId`, and `siteId`.
- **Sensitive Operations**: Key rotations, revocations, and configuration changes generate high-fidelity audit trail entries.
- **Leaked Key Prevention**: Plaintext keys are never recorded in logs.

## 6. Best Practices for Developers
- **Caching**: Implement client-side caching to respect rate limits.
- **Backoff**: Use exponential backoff when receiving `429 Too Many Requests`.
- **Secret Management**: Store API keys in secure vaults or environment variables. Never hardcode them.
