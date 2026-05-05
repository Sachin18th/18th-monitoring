# Quick Reference — Test Users & Login

## 🚀 Quick Start
```bash
# 1. Start API (auto-seeds on startup)
npm run dev:api

# 2. Login with any user
curl -X POST http://127.0.0.1:4000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@18thdigitech.com","password":"Demo@1234!"}'

# 3. Copy token from response
# 4. Use token: Authorization: Bearer <token>
```

---

## 👥 Users (All password: `Demo@1234!`)

| Email | Role | Can |
|-------|------|-----|
| `superadmin@18thdigitech.com` | SUPER_ADMIN | Everything |
| `projectadmin@18thdigitech.com` | PROJECT_ADMIN | Manage projects & users |
| `opslead@18thdigitech.com` | OPERATOR | View & monitor |
| `analyst@18thdigitech.com` | VIEWER | Read-only access |

---

## 📋 Response Example
```json
{
  "status": "success",
  "data": {
    "token": "abc123def456...",
    "user": {
      "id": "user_18th_super",
      "email": "superadmin@18thdigitech.com",
      "role": "SUPER_ADMIN",
      "name": "18th Super Admin"
    }
  }
}
```

---

## ⚙️ How It Works

**Seeding** (happens at startup):
1. Random 16-byte salt generated
2. Password hashed with scrypt: `crypto.scrypt("Demo@1234!", salt, 64)`
3. Stored as: `{salt}:{derivedkey}` in GlobalMemoryStore

**Login**:
1. User sends email & password
2. System extracts salt from stored hash
3. Hashes password with same salt
4. Compares hashes (timing-safe)
5. Returns token if match ✓

**Why it works**: Same input + same salt = same hash!

---

## ✅ What's Correct This Time

| Aspect | Value | Why It Matters |
|--------|-------|----------------|
| Salt | Random 16-byte | Unique per password, secure |
| Hashing | crypto.scrypt | Matches login logic |
| Format | `{hex_salt}:{hex_key}` | Correctly parsed by login |
| Status | `'active'` (lowercase) | Login checks for lowercase |
| Roles | SUPER_ADMIN, etc. | Matches auth middleware |
| Password | `Demo@1234!` | Capital D, number, symbol |

---

## 🔧 If Login Fails

❌ "Invalid credentials"
- Wrong password? Try `Demo@1234!` exactly (case matters!)
- User doesn't exist? Check email spelling

❌ "User not found or inactive"  
- API didn't finish seeding? Restart with `npm run dev:api`
- Watch logs for `[Seeder:Auth]` messages

❌ Still stuck?
- See [SEED_INSTRUCTIONS.md](SEED_INSTRUCTIONS.md) for full troubleshooting
- Check [LOGIN_VERIFICATION.md](LOGIN_VERIFICATION.md) for technical details

---

## 📚 More Info

- [SEED_INSTRUCTIONS.md](SEED_INSTRUCTIONS.md) — Full guide
- [LOGIN_VERIFICATION.md](LOGIN_VERIFICATION.md) — Technical trace
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) — What changed

---

**Status**: ✅ Ready to use — no more "invalid credentials" errors!
