-- Issue #5 (FR-3): logout must end the session immediately.
-- Every login token carries the user's session_version; logout increases it,
-- so tokens issued before the logout are rejected by the API.
ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
