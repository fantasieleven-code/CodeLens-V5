-- Task B-A12: add candidateProfile JSONB + consentAcceptedAt TIMESTAMP
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "candidateProfile" JSONB,
ADD COLUMN     "consentAcceptedAt" TIMESTAMP(3);
