-- Add guard decision fields used by WeCom one-click approval links.
ALTER TABLE "VisitorLog" ADD COLUMN "actionToken" TEXT;
ALTER TABLE "VisitorLog" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "VisitorLog" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "VisitorLog" ADD COLUMN "decisionSource" TEXT;
ALTER TABLE "VisitorLog" ADD COLUMN "decisionNote" TEXT;

CREATE UNIQUE INDEX "VisitorLog_actionToken_key" ON "VisitorLog"("actionToken");
