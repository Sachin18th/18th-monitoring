-- Reversible, encrypted-at-rest copy of the customer email.
--
-- `customer_profiles` previously kept emails only as the one-way `email_hash`,
-- which the dashboard cannot display. This adds `email_encrypted` — an
-- AES-256-GCM `enc:v1:` envelope written by encryptEmail() and decrypted on the
-- read path so the customer page can show the real address while the database
-- stores only ciphertext. `email_hash` stays the identity-resolution key.
--
-- Additive / IF NOT EXISTS — safe to re-run. Existing rows stay NULL until the
-- next connector sync re-populates them (the hash is irreversible, so historical
-- addresses cannot be backfilled).

ALTER TABLE "customer_profiles" ADD COLUMN IF NOT EXISTS "email_encrypted" TEXT;
