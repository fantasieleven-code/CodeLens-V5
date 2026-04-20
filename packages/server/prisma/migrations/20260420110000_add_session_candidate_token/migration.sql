-- Task B-A12 auth-fallback: add Session.candidateToken (nullable opaque token)
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "candidateToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Session_candidateToken_key" ON "Session"("candidateToken");
