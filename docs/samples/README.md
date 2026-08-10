# Sample offline / POS order import

`offline-pos-orders-sample.csv` — 15 rows for exercising the offline order import and
its customer matching (CDP Phase A). Upload it via **Orders → Import Orders (CSV)**.

The headers are deliberately *not* the canonical field names (`Order No`, `Mobile`,
`Member ID`, `Branch`, …) so the import also proves the column auto-matcher.

Three rows carry **real emails from the "18th Digitech Demo" store**
(connector `99900108-c8a0-4b4a-a602-325d8bea212e`, project `proj_c644d2ec90aa8c6b`) so
matching actually fires. Target that store on upload, and pick **INR** as the currency
— offline sheets rarely carry one, so the operator's choice applies to every row.

## What each row covers

| Row | Covers | Expected against the demo store |
|---|---|---|
| POS-1001 | Match by **email** | → `riya gusain` |
| POS-1002 | Email match that also **seeds a phone** onto the profile | → `surbhi p`, `phone_hash` filled in |
| POS-1003 | **Loyalty ID** only (`external_ids.pos`) | new offline customer |
| POS-1004 | Email + phone + loyalty on one row | → `Dhruv Singh`, `phone_hash` filled in |
| POS-1005 | New walk-in (email + phone) | new offline customer |
| POS-1006 | Same phone as POS-1005 | reuses that new customer — second order |
| POS-1007 | No contact details at all | unidentified; order still imports |
| POS-1008 | **Shared phone** — Dhruv's number with a different email | ⚠ phone conflict; own customer created, Dhruv untouched |
| POS-1009 | `Returned` status + `DD/MM/YYYY` date | → `riya gusain` again |
| POS-1010 | Phone as `+919812009900` — see the gotcha below | new offline customer |
| POS-1011 | Currency symbol + thousands separator (`₹7,250.00`) | new offline customer |
| POS-1012 | `Cancelled` status | new offline customer |
| POS-1013 | **Phone-only match** to a real customer, different branch | → `surbhi p` by phone (seeded at POS-1002) |
| POS-1014 | **Phone-only match** + `Shipped` status | → `Dhruv Singh` by phone (seeded at POS-1004) |
| POS-1015 | Multi-quantity line, loyalty ID + email | new offline customer |

**Expected match report:** 15 orders imported · **3 customers matched** · **7 new
customers** · 14 rows linked · 1 unidentified · **1 phone conflict**. The store goes
from 8 profiles to 15, and `surbhi p` + `Dhruv Singh` gain a `phone_hash` they did not
have before.

Note the ordering dependency: POS-1013/1014 match **by phone** only because POS-1002/1004
matched by email earlier in the same file and enriched those profiles with the number.
That is the realistic path — Shopify customers here have no phone on file, so
`phone_hash` starts NULL and the first offline order carrying both is what seeds it.

## Gotchas worth knowing

- **Phone formatting must match what the platform stored.** Hashing keeps digits and a
  leading `+`, so `+919812009900` and `9812009900` produce *different* hashes and will
  never match each other. If your platform customers hold E.164 numbers, the POS export
  needs the country code too (POS-1010 exists to make this visible).
- **Matching needs an existing store as the target.** Customer profiles are scoped to a
  connector instance, so an import that creates its own CSV store has nothing to match
  against. The match report says so when that happens.
- **One row = one order.** This importer has no line-item grouping: a till export with
  one row per item would create one order per item and inflate order counts and revenue.
  Aggregate to order level before importing.
- **Re-uploading is not idempotent.** Unlike the platform syncs (which upsert on the
  external reference), an offline import always inserts. Uploading this file twice
  creates 30 orders. Customer profiles *are* idempotent — the second run matches rather
  than duplicating them, and reports 10 matched / 0 new.
- **`PII_HASH_PEPPER` must stay empty**, or the new hashes won't line up with the
  existing profiles' `email_hash`.
