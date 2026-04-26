-- Initial PostgreSQL schema for the voice-agent backend.
CREATE TABLE "VisitorLog" (
    "id" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "targetCompany" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "visitReason" TEXT NOT NULL,
    "callerNumber" TEXT,
    "entryTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "callId" TEXT,
    "rawSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'notified',
    "wecomSentAt" TIMESTAMP(3),
    "wecomError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitorLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisitorProfile" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "callerNumber" TEXT,
    "plateNumber" TEXT,
    "targetCompany" TEXT,
    "visitReason" TEXT,
    "lastVisitAt" TIMESTAMP(3),
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitorProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyAlias" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,

    CONSTRAINT "CompanyAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT,
    "callId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisitorLog_callId_key" ON "VisitorLog"("callId");
CREATE INDEX "VisitorLog_entryTime_idx" ON "VisitorLog"("entryTime");
CREATE INDEX "VisitorLog_plateNumber_idx" ON "VisitorLog"("plateNumber");
CREATE INDEX "VisitorLog_phone_idx" ON "VisitorLog"("phone");
CREATE INDEX "VisitorLog_targetCompany_idx" ON "VisitorLog"("targetCompany");
CREATE INDEX "VisitorProfile_phone_idx" ON "VisitorProfile"("phone");
CREATE INDEX "VisitorProfile_callerNumber_idx" ON "VisitorProfile"("callerNumber");
CREATE INDEX "VisitorProfile_plateNumber_idx" ON "VisitorProfile"("plateNumber");
CREATE UNIQUE INDEX "CompanyAlias_alias_key" ON "CompanyAlias"("alias");
CREATE INDEX "CallEvent_callId_idx" ON "CallEvent"("callId");
CREATE INDEX "CallEvent_eventType_idx" ON "CallEvent"("eventType");
CREATE INDEX "CallEvent_createdAt_idx" ON "CallEvent"("createdAt");
