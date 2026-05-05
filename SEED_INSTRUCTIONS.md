# 4 Test Users Seed Script — Running Instructions

## Quick Start

### Option 1: Auto-seed on API startup (Recommended)
The 4 users are now **automatically seeded** when the API server starts because they're integrated into the demo-seeder:

```bash
npm run dev:api
```

The API will:
1. Initialize GlobalMemoryStore
2. Call seed18thDigitech() from demo-seeder.ts
3. Create all 4 users with correct scrypt hashing + random salts
4. Set status to 'active' so they can log in

### Option 2: Run standalone seed script
If you want to seed users in an already-running API:

```bash
cd packages/db
npm run seed:auth
```

This runs the `seed-18th-auth-users.ts` script with async scrypt hashing. **Requires restart** of the API to apply.

---

## Users Created

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `superadmin@18thdigitech.com` | `Demo@1234!` |
| Project Admin | `projectadmin@18thdigitech.com` | `Demo@1234!` |
| Ops Lead (OPERATOR) | `opslead@18thdigitech.com` | `Demo@1234!` |
| Analyst (VIEWER) | `analyst@18thdigitech.com` | `Demo@1234!` |

---

## Test Login

### Curl Example
```bash
curl -X POST http://127.0.0.1:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@18thdigitech.com","password":"Demo@1234!"}'
```

### Expected Response (Success)
```json
{
  "status": "success",
  "data": {
    "token": "<jwt-token>",
    "user": {
      "id": "user_18th_super",
      "email": "superadmin@18thdigitech.com",
      "name": "18th Super Admin",
      "role": "SUPER_ADMIN",
      "tenantId": "tenant_18th_digitech",
      "status": "active"
    }
  }
}
```

### Expected Response (Invalid Password)
```json
{
  "status": "error",
  "error": "Invalid credentials",
  "code": "AUTH_FAILED"
}
```

---

## How It Works (Technical Details)

### Seed Process
1. **Hashing**: Each password is hashed using `crypto.scryptSync()` with a **random 16-byte salt**
2. **Storage Format**: `"{hexsalt}:{hexkey}"` — exactly matching AuthService.comparePassword()
3. **Idempotent**: Users are only created if they don't already exist (checks by email)
4. **Tenant/Project**: Auto-creates tenant `tenant_18th_digitech` and project `proj-18th-digitech`

### Login Flow (with tracing for superadmin@18thdigitech.com + Demo@1234!)

```
POST /api/v1/auth/login
├─ Body: { email: "superadmin@18thdigitech.com", password: "Demo@1234!" }
│
└─ AuthService.login()
   ├─ Find user by email in GlobalMemoryStore.users ✓
   │  └─ Returns: { email, role: 'SUPER_ADMIN', status: 'active', passwordHash: '...' }
   │
   ├─ Check user.status === 'active' ✓ (matches!)
   │
   ├─ Call comparePassword("Demo@1234!", "{salt}:{hash}")
   │  ├─ Extract salt from stored hash
   │  ├─ Run: crypto.scrypt("Demo@1234!", salt, 64)
   │  ├─ Compare derived key with stored key using timingSafeEqual()
   │  └─ Return: true ✓
   │
   ├─ Generate session token
   ├─ Store in GlobalMemoryStore.sessions
   │
   └─ Return: { token, user } ✓ LOGIN SUCCESS
```

---

## Troubleshooting

### "Invalid credentials"
- ✗ User doesn't exist → Check email spelling (case-sensitive)
- ✗ Status is not 'active' → Re-seed users (delete API cache)
- ✗ Wrong password → Verify you typed `Demo@1234!` correctly (note the capital D and !)
- ✗ Password hashing mismatch → Restart API server after seeding

### "User not found or inactive"
- API never completed the seeding phase
- **Solution**: Restart with `npm run dev:api` and wait for `[Seeder:Auth]` log messages

### Seed won't complete
- Check that packages/db has tsx installed: `cd packages/db && npm install`
- If standalone seed fails: `npm run seed:auth` should exit with code 0

---

## Notes

- All 4 users share the same password (`Demo@1234!`) for testing
- Users are automatically assigned to project `proj-18th-digitech`
- Seeding is **idempotent** — running it multiple times won't create duplicates
- The in-memory store is lost on API restart (data is not persisted)
