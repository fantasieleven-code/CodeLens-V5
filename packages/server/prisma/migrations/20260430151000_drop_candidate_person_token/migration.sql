-- V5.0.5 hardening: remove unused person-scoped Candidate token columns.
-- Candidate exam/self-view auth now uses Session-scoped candidateToken and
-- candidateSelfViewToken. Keeping Candidate.token invites cross-session replay.
ALTER TABLE "Candidate" DROP COLUMN IF EXISTS "token";
ALTER TABLE "Candidate" DROP COLUMN IF EXISTS "tokenExpiresAt";
