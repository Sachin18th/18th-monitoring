# Platform API Contract Standards (v1)

This document defines the strict standards for all externally exposed APIs on the Monitoring Platform. All new endpoints must adhere to these rules to ensure stability, predictability, and ease of integration.

## 1. Core Principles
- **Contract-First**: Every endpoint must have a Zod schema defining its request and response.
- **Strict Typing**: No `any` types in public schemas; all enums must be normalized.
- **CamelCase Everywhere**: All JSON fields, query parameters, and URL slugs use `camelCase`.
- **Envelope Consistency**: All responses use the canonical envelope defined in `common.schema.ts`.

---

## 2. Global Response Envelope

All API responses must follow this structure exactly:

```json
{
  "status": "success | error",
  "data": { ... },
  "metadata": {
    "timestamp": "ISO-8601",
    "traceId": "tx_...",
    "version": "v1",
    "siteId": "identifier",
    "freshness": "fresh | delayed | stale",
    "pagination": {
       "total": 120,
       "limit": 50,
       "offset": 0,
       "hasNext": true
    },
    "filters": { "status": "shipped" }
  },
  "errors": [
    { "code": "CODE", "message": "Reason", "field": "path", "category": "..." }
  ]
}
```

---

## 3. Standard Request Parameters

### Pagination
- `limit`: (1-1000, default 50)
- `offset`: (default 0)
- `page`: (optional, alternative to offset)

### Time Ranges
- `from`: Start ISO-8601
- `to`: End ISO-8601
- `range`: Shortcut enum (`1h`, `6h`, `24h`, `7d`, `30d`)

### Sorting
- `sortBy`: Field name
- `sortOrder`: `asc` | `desc` (default `desc`)

---

## 4. Error Taxonomy

Errors must use one of the following canonical categories:

| Category | HTTP Code | Meaning |
|----------|-----------|---------|
| `unauthorized` | 401 | Missing or invalid API Key. |
| `forbidden` | 403 | Insufficient scopes for the resource. |
| `invalid_request` | 400 | Syntax error in payload or headers. |
| `validation_error` | 400 | Data fails schema validation (includes `field` info). |
| `not_found` | 404 | Resource or project does not exist. |
| `rate_limited` | 429 | Quota exceeded. |
| `internal_error` | 500 | Unexpected platform failure. |

---

## 5. Versioning and Compatibility

### Non-Breaking Changes (v1.x)
- Adding new optional fields to a response.
- Adding new enum values (if consumers are notified or if it's a non-critical field).
- Adding new optional query parameters.

### Breaking Changes (Requires v2)
- Removing or renaming an existing field.
- Changing a field's data type (e.g., number to string).
- Adding required request parameters.
- Changing enum values that alter business logic.

### Deprecation Policy
- Deprecated fields will include a `deprecated: true` indicator in machine-readable schemas.
- Deprecation notices will be sent 90 days before removal.
- The `Sunset` header will be used on deprecated endpoints.

---

## 6. Governance Workflow
1. **Schema Review**: Define `.schema.ts` for any new resource.
2. **Contract Validation**: Use `validateRequest` middleware and `ResponseUtil.success`.
3. **Integration Test**: Verify the response against the schema in CI.
4. **Documentation**: Update the technical reference.
