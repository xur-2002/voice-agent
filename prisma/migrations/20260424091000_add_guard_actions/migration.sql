-- Add guard decision fields used by WeCom one-click approval links.
ALTER TABLE "VisitorLog" ADD COLUMN "actionToken" TEXT;
ALTER TABLE "VisitorLog" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "VisitorLog" ADD COLUMN "rejectedAt" DATETIME;
ALTER TABLE "VisitorLog" ADD COLUMN "decisionSource" TEXT;
ALTER TABLE "VisitorLog" ADD COLUMN "decisionNote" TEXT;

CREATE UNIQUE INDEX "VisitorLog_actionToken_key" ON "VisitorLog"("actionToken");
