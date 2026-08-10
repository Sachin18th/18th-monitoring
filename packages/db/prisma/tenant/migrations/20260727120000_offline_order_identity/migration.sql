-- Offline / POS order identity (CDP Phase A) — see docs/CDP-IMPLEMENTATION-PLAN.md §4.
-- Links every canonical order to the CustomerProfile golden record so orders that
-- arrive from a till or an OMS spreadsheet land on the same customer as the online
-- ones. Idempotent so it is safe to re-run across every provisioned tenant database.

-- Resolved owner of the order. Nullable by design: guest checkouts and offline rows
-- with no email/phone have no profile. Deliberately NO foreign key — profiles are
-- deleted when two are merged, and the order history must outlive that.
ALTER TABLE "canonical_orders" ADD COLUMN IF NOT EXISTS "customer_profile_id" VARCHAR(36);

-- Drives "all orders for this customer" (unified online + offline history).
CREATE INDEX IF NOT EXISTS "idx_order_customer_profile"
    ON "canonical_orders"("connector_instance_id", "customer_profile_id");

-- Phone is now a first-class identity edge (identifier_type = 'phone_hash'), the
-- primary join key for POS rows. Speeds the golden-record fallback lookup that runs
-- when no identity_link edge exists yet.
CREATE INDEX IF NOT EXISTS "idx_cust_profile_phone"
    ON "customer_profiles"("connector_instance_id", "phone_hash");
