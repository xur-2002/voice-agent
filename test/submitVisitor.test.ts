import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";

const prisma = new PrismaClient();
const app = buildApp({ prisma, logger: false, wecomWebhookUrl: "" });

describe("submit visitor flow", () => {
  beforeAll(async () => {
    await app.ready();
  });

  beforeEach(async () => {
    await prisma.callEvent.deleteMany();
    await prisma.visitorProfile.deleteMany();
    await prisma.visitorLog.deleteMany();
    await prisma.companyAlias.deleteMany();
    await prisma.companyAlias.createMany({
      data: [
        { alias: "蓝鲸", canonicalName: "蓝色鲸鱼科技" },
        { alias: "蓝色鲸鱼", canonicalName: "蓝色鲸鱼科技" }
      ]
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("saves a visitor and mock-sends WeCom when webhook is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/submit-visitor",
      payload: {
        plate_number: "沪 a12345",
        target_company: "蓝鲸",
        phone: "138 1234 1234",
        visit_reason: "送货的",
        caller_number: "+13145550000",
        call_id: "test-call-001"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe("mock-sent");

    const log = await prisma.visitorLog.findUnique({ where: { callId: "test-call-001" } });
    expect(log?.plateNumber).toBe("沪A12345");
    expect(log?.targetCompany).toBe("蓝色鲸鱼科技");
    expect(log?.status).toBe("mock-sent");
  });

  it("does not duplicate WeCom notification or records for the same callId", async () => {
    const payload = {
      plate_number: "沪A12345",
      target_company: "蓝鲸",
      phone: "13812341234",
      visit_reason: "配送",
      call_id: "test-call-idempotent"
    };

    const first = await app.inject({ method: "POST", url: "/tools/submit-visitor", payload });
    const second = await app.inject({ method: "POST", url: "/tools/submit-visitor", payload });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe("idempotent");
    expect(await prisma.visitorLog.count({ where: { callId: "test-call-idempotent" } })).toBe(1);
  });

  it("returns confirmation request for low-confidence plate", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/submit-visitor",
      payload: {
        plate_number: "沪A12345",
        target_company: "蓝鲸",
        phone: "13812341234",
        visit_reason: "送货",
        confidence: { plate_number: 0.5 }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: false,
      status: "needs_confirmation",
      field: "plate_number"
    });
  });
});
