-- Initial schema for the Simplified GDPR Consent Manager (SAD v1.0, Section 3.6).

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'DPO');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ConsentAction" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_purposes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "processing_purposes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" UUID NOT NULL,
    "version_no" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "change_summary" TEXT NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose_id" UUID NOT NULL,
    "action" "ConsentAction" NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_entries" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "outcome" "AuditOutcome" NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prev_hash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_review_notices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(3),

    CONSTRAINT "policy_review_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "processing_purposes_code_key" ON "processing_purposes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_version_no_key" ON "policy_versions"("version_no");

-- CreateIndex
CREATE INDEX "consent_records_user_id_purpose_id_recorded_at_idx" ON "consent_records"("user_id", "purpose_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "consent_records_recorded_at_idx" ON "consent_records"("recorded_at");

-- CreateIndex
CREATE INDEX "audit_entries_created_at_idx" ON "audit_entries"("created_at");

-- CreateIndex
CREATE INDEX "audit_entries_actor_id_idx" ON "audit_entries"("actor_id");

-- CreateIndex
CREATE INDEX "audit_entries_action_idx" ON "audit_entries"("action");

-- CreateIndex
CREATE UNIQUE INDEX "policy_review_notices_user_id_policy_version_id_key" ON "policy_review_notices"("user_id", "policy_version_id");

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_purpose_id_fkey" FOREIGN KEY ("purpose_id") REFERENCES "processing_purposes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_review_notices" ADD CONSTRAINT "policy_review_notices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_review_notices" ADD CONSTRAINT "policy_review_notices_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity rules that Prisma cannot express (SRS FR-11, FR-15, SEC-6)
-- ---------------------------------------------------------------------------

-- 1. consent_records and audit_entries are append-only.
CREATE OR REPLACE FUNCTION reject_modification() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'APPEND_ONLY: % on table % is not allowed', TG_OP, TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consent_records_append_only
    BEFORE UPDATE OR DELETE ON "consent_records"
    FOR EACH ROW EXECUTE FUNCTION reject_modification();

CREATE TRIGGER audit_entries_append_only
    BEFORE UPDATE OR DELETE ON "audit_entries"
    FOR EACH ROW EXECUTE FUNCTION reject_modification();

-- 2. Published / superseded policy versions are frozen.  The only change allowed after
--    publication is PUBLISHED -> SUPERSEDED (all other columns unchanged).
CREATE OR REPLACE FUNCTION protect_policy_versions() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'DRAFT' THEN
            RAISE EXCEPTION 'POLICY_LOCKED: published or superseded policy versions cannot be deleted'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status = 'DRAFT' THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'PUBLISHED' AND NEW.status = 'SUPERSEDED'
       AND NEW.version_no = OLD.version_no AND NEW.title = OLD.title AND NEW.body = OLD.body
       AND NEW.change_summary = OLD.change_summary
       AND NEW.effective_at IS NOT DISTINCT FROM OLD.effective_at THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'POLICY_LOCKED: policy version % is % and cannot be modified', OLD.version_no, OLD.status
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER policy_versions_protect
    BEFORE UPDATE OR DELETE ON "policy_versions"
    FOR EACH ROW EXECUTE FUNCTION protect_policy_versions();

-- 3. At most one PUBLISHED policy version at any time.
CREATE OR REPLACE FUNCTION single_published_policy() RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'PUBLISHED' AND EXISTS (
        SELECT 1 FROM "policy_versions" WHERE status = 'PUBLISHED' AND id <> NEW.id
    ) THEN
        RAISE EXCEPTION 'POLICY_CONFLICT: another policy version is already PUBLISHED'
            USING ERRCODE = 'unique_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER policy_versions_single_published
    BEFORE INSERT OR UPDATE ON "policy_versions"
    FOR EACH ROW EXECUTE FUNCTION single_published_policy();
