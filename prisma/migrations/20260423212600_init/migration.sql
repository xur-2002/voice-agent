-- CreateTable
CREATE TABLE "VisitorLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plateNumber" TEXT NOT NULL,
    "targetCompany" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "visitReason" TEXT NOT NULL,
    "callerNumber" TEXT,
    "entryTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "callId" TEXT,
    "rawSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'notified',
    "wecomSentAt" DATETIME,
    "wecomError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VisitorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT,
    "callerNumber" TEXT,
    "plateNumber" TEXT,
    "targetCompany" TEXT,
    "visitReason" TEXT,
    "lastVisitAt" DATETIME,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CompanyAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alias" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT,
    "callId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitorLog_callId_key" ON "VisitorLog"("callId");

-- CreateIndex
CREATE INDEX "VisitorLog_entryTime_idx" ON "VisitorLog"("entryTime");

-- CreateIndex
CREATE INDEX "VisitorLog_plateNumber_idx" ON "VisitorLog"("plateNumber");

-- CreateIndex
CREATE INDEX "VisitorLog_phone_idx" ON "VisitorLog"("phone");

-- CreateIndex
CREATE INDEX "VisitorLog_targetCompany_idx" ON "VisitorLog"("targetCompany");

-- CreateIndex
CREATE INDEX "VisitorProfile_phone_idx" ON "VisitorProfile"("phone");

-- CreateIndex
CREATE INDEX "VisitorProfile_callerNumber_idx" ON "VisitorProfile"("callerNumber");

-- CreateIndex
CREATE INDEX "VisitorProfile_plateNumber_idx" ON "VisitorProfile"("plateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAlias_alias_key" ON "CompanyAlias"("alias");

-- CreateIndex
CREATE INDEX "CallEvent_callId_idx" ON "CallEvent"("callId");

-- CreateIndex
CREATE INDEX "CallEvent_eventType_idx" ON "CallEvent"("eventType");

-- CreateIndex
CREATE INDEX "CallEvent_createdAt_idx" ON "CallEvent"("createdAt");
