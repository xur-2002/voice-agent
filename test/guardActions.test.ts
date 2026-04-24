import { PrismaClient, type VisitorLog } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";
import { formatVisitorMarkdown } from "../src/services/wecom.js";

const prisma = new PrismaClient();
const app = buildApp({
  prisma,
  logger: false,
  wecomWebhookUrl: "",
  publicBaseUrl: "https://demo.example"
});

describe("guard action links", () => {
  beforeAll(async () => {
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.callEvent.deleteMany();
    await prisma.visitorProfile.deleteMany();
    await prisma.visitorLog.deleteMany();
    await prisma.companyAlias.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("generates an action token when submitting a visitor", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/submit-visitor",
      payload: {
        plate_number: "沪A12345",
        target_company: "蓝色鲸鱼",
        phone: "13386652510",
        visit_reason: "送货",
        call_id: "guard-token-test"
      }
    });

    expect(response.statusCode).toBe(200);
    const log = await prisma.visitorLog.findUnique({ where: { callId: "guard-token-test" } });
    expect(log?.actionToken).toEqual(expect.any(String));
    expect(log?.actionToken?.length).toBeGreaterThan(24);
  });

  it("includes approve and reject links in WeCom markdown", () => {
    const markdown = formatVisitorMarkdown(
      {
        id: "visitor-1",
        plateNumber: "沪A12345",
        targetCompany: "蓝色鲸鱼科技",
        phone: "13386652510",
        visitReason: "送货",
        entryTime: new Date("2026-04-24T09:05:00.000Z"),
        actionToken: "token-123"
      } as Pick<
        VisitorLog,
        "id" | "plateNumber" | "targetCompany" | "phone" | "visitReason" | "entryTime" | "actionToken"
      >,
      { publicBaseUrl: "https://demo.example/" }
    );

    expect(markdown).toContain("[✅ 确认放行](https://demo.example/guard/visitors/visitor-1/approve?token=token-123)");
    expect(markdown).toContain("[❌ 拒绝放行](https://demo.example/guard/visitors/visitor-1/reject?token=token-123)");
  });

  it("approves a visitor with a valid token", async () => {
    const visitor = await createVisitor("approve-token");

    const response = await app.inject({
      method: "GET",
      url: `/guard/visitors/${visitor.id}/approve?token=approve-token`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("已确认放行：沪A12345");

    const updated = await prisma.visitorLog.findUniqueOrThrow({ where: { id: visitor.id } });
    expect(updated.status).toBe("approved");
    expect(updated.approvedAt).toBeInstanceOf(Date);
    expect(updated.decisionSource).toBe("wecom-link");
  });

  it("rejects a visitor with a valid token", async () => {
    const visitor = await createVisitor("reject-token");

    const response = await app.inject({
      method: "GET",
      url: `/guard/visitors/${visitor.id}/reject?token=reject-token`
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("已拒绝放行：沪A12345");

    const updated = await prisma.visitorLog.findUniqueOrThrow({ where: { id: visitor.id } });
    expect(updated.status).toBe("rejected");
    expect(updated.rejectedAt).toBeInstanceOf(Date);
    expect(updated.decisionSource).toBe("wecom-link");
  });

  it("rejects invalid tokens", async () => {
    const visitor = await createVisitor("valid-token");

    const response = await app.inject({
      method: "GET",
      url: `/guard/visitors/${visitor.id}/approve?token=bad-token`
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain("操作无效或链接已过期");

    const unchanged = await prisma.visitorLog.findUniqueOrThrow({ where: { id: visitor.id } });
    expect(unchanged.status).toBe("notified");
  });

  it("keeps double approval idempotent", async () => {
    const visitor = await createVisitor("double-approve-token");

    const first = await app.inject({
      method: "GET",
      url: `/guard/visitors/${visitor.id}/approve?token=double-approve-token`
    });
    const approved = await prisma.visitorLog.findUniqueOrThrow({ where: { id: visitor.id } });

    const second = await app.inject({
      method: "GET",
      url: `/guard/visitors/${visitor.id}/approve?token=double-approve-token`
    });
    const approvedAgain = await prisma.visitorLog.findUniqueOrThrow({ where: { id: visitor.id } });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(approvedAgain.status).toBe("approved");
    expect(approvedAgain.approvedAt?.toISOString()).toBe(approved.approvedAt?.toISOString());
  });
});

async function createVisitor(actionToken: string) {
  return prisma.visitorLog.create({
    data: {
      plateNumber: "沪A12345",
      targetCompany: "蓝色鲸鱼科技",
      phone: "13386652510",
      visitReason: "送货",
      status: "notified",
      actionToken
    }
  });
}
