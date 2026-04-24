import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/server.js";

const prisma = new PrismaClient();
const app = buildApp({ prisma, logger: false, wecomWebhookUrl: "" });

describe("phone fallback tools", () => {
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

  it("validates Chinese spoken digits", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/validate-phone",
      payload: {
        phone: "一三三，八六六，五二五，一零",
        call_id: "phone-valid"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      valid: true,
      normalized_phone: "13386652510"
    });
  });

  it("rejects masked placeholders", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/validate-phone",
      payload: {
        phone: "138xxxx1234",
        call_id: "phone-masked"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      valid: false
    });
  });

  it("normalizes valid keypad digits", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/phone-digits",
      payload: {
        digits: "133 866 525 10",
        call_id: "digits-valid",
        source: "dtmf"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      valid: true,
      normalized_phone: "13386652510"
    });
  });

  it("rejects invalid keypad digits", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/phone-digits",
      payload: {
        digits: "12345",
        call_id: "digits-invalid",
        source: "dtmf"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      valid: false
    });
  });

  it("submitVisitor accepts valid normalized phone even when confidence is low", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/submit-visitor",
      payload: {
        plate_number: "沪A12345",
        target_company: "蓝色鲸鱼",
        phone: "幺三三八六六五二五一零",
        visit_reason: "送货",
        call_id: "spoken-phone-submit",
        confidence: { phone: 0.2 }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);

    const log = await prisma.visitorLog.findUnique({ where: { callId: "spoken-phone-submit" } });
    expect(log?.phone).toBe("13386652510");
  });
});
