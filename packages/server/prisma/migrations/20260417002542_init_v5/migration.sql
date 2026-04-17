-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "interviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "orgId" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "sandboxId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "scoringResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "orgId" TEXT,
    "token" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'landing_page',
    "status" TEXT NOT NULL DEFAULT 'new',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY['interview.completed']::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamInstance" (
    "id" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "businessScenario" JSONB NOT NULL,
    "techStack" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "challengePattern" TEXT NOT NULL,
    "archStyle" TEXT,
    "level" TEXT NOT NULL,
    "orgId" TEXT,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "avgCompletionMins" DOUBLE PRECISION,
    "avgCompositeScore" DOUBLE PRECISION,
    "discriminationScore" DOUBLE PRECISION,
    "lastUsedAt" TIMESTAMP(3),
    "qualityReport" JSONB,

    CONSTRAINT "ExamInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamModule" (
    "id" TEXT NOT NULL,
    "examInstanceId" TEXT NOT NULL,
    "moduleType" TEXT NOT NULL,
    "scenarioRef" TEXT,
    "moduleSpecific" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgMember_email_idx" ON "OrgMember"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_orgId_email_key" ON "OrgMember"("orgId", "email");

-- CreateIndex
CREATE INDEX "Session_candidateId_idx" ON "Session"("candidateId");

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "Session"("status");

-- CreateIndex
CREATE INDEX "Session_orgId_idx" ON "Session"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Candidate_email_key" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "Candidate_orgId_idx" ON "Candidate"("orgId");

-- CreateIndex
CREATE INDEX "EventLog_sessionId_idx" ON "EventLog"("sessionId");

-- CreateIndex
CREATE INDEX "EventLog_category_idx" ON "EventLog"("category");

-- CreateIndex
CREATE INDEX "EventLog_timestamp_idx" ON "EventLog"("timestamp");

-- CreateIndex
CREATE INDEX "EventLog_sessionId_timestamp_idx" ON "EventLog"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "EventLog_sessionId_category_timestamp_idx" ON "EventLog"("sessionId", "category", "timestamp");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "PromptVersion_name_isActive_idx" ON "PromptVersion"("name", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_name_version_key" ON "PromptVersion"("name", "version");

-- CreateIndex
CREATE INDEX "WebhookConfig_orgId_idx" ON "WebhookConfig"("orgId");

-- CreateIndex
CREATE INDEX "ExamInstance_orgId_idx" ON "ExamInstance"("orgId");

-- CreateIndex
CREATE INDEX "ExamModule_examInstanceId_idx" ON "ExamModule"("examInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamModule_examInstanceId_moduleType_key" ON "ExamModule"("examInstanceId", "moduleType");

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookConfig" ADD CONSTRAINT "WebhookConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamInstance" ADD CONSTRAINT "ExamInstance_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamModule" ADD CONSTRAINT "ExamModule_examInstanceId_fkey" FOREIGN KEY ("examInstanceId") REFERENCES "ExamInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
