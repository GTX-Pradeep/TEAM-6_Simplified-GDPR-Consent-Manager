-- Issue #28 (NFR-10): e-mail addresses are stored encrypted.
-- users.email now holds AES-256-GCM ciphertext (random IV), so it can no longer be unique;
-- uniqueness and look-ups use users.email_hash (HMAC-SHA256 of the address) instead.
-- Existing rows are converted by `npm run db:encrypt-emails -w server` (or at their next login).
DROP INDEX IF EXISTS "users_email_key";
ALTER TABLE "users" ADD COLUMN "email_hash" TEXT;
CREATE UNIQUE INDEX "users_email_hash_key" ON "users"("email_hash");
