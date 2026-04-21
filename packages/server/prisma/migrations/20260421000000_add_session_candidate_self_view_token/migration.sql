-- Task B-A10-lite: add Session.candidateSelfViewToken (nullable opaque token)
-- Two-token separation pattern: candidateToken (exam bearer, admin-visible)
-- vs candidateSelfViewToken (candidate-private self-view URL token).
-- Add-nullable-only (Pattern H migration sub-gate, obs #122 template reuse).

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "candidateSelfViewToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Session_candidateSelfViewToken_key" ON "Session"("candidateSelfViewToken");
