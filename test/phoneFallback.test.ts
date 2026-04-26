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

  it("submitVisitor uses caller_number when phone is missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/submit-visitor",
      payload: {
        plate_number: "沪A12345",
        target_company: "蓝色鲸鱼",
        visit_reason: "送货",
        caller_number: "+131486652510",
        call_id: "caller-number-submit"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);

    const log = await prisma.visitorLog.findUnique({ where: { callId: "caller-number-submit" } });
    expect(log?.phone).toBe("+131486652510");
    expect(log?.callerNumber).toBe("+131486652510");
  });

  it("submitVisitor keeps explicit phone when caller_number is also present", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/submit-visitor",
      payload: {
        plate_number: "沪A12345",
        target_company: "蓝色鲸鱼",
        phone: "13386652510",
        visit_reason: "送货",
        caller_number: "+131486652510",
        call_id: "explicit-phone-submit"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);

    const log = await prisma.visitorLog.findUnique({ where: { callId: "explicit-phone-submit" } });
    expect(log?.phone).toBe("13386652510");
    expect(log?.callerNumber).toBe("+131486652510");
  });

  it("resolve-contact-phone asks to confirm a valid caller number", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/resolve-contact-phone",
      payload: {
        caller_number: "+131486652510"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      needs_confirmation: true,
      candidate_phone: "+131486652510",
      last4: "2510",
      message: "我看到您的来电号码尾号 2510，可以作为联系电话吗？"
    });
  });

  it("resolve-contact-phone uses confirmed caller number", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/resolve-contact-phone",
      payload: {
        caller_number: "+131486652510",
        confirmed_use_caller_number: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      normalized_phone: "+131486652510",
      source: "caller_number"
    });
  });

  it("resolve-contact-phone returns needs_phone when both inputs are missing or invalid", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/resolve-contact-phone",
      payload: {
        phone: "138xxxx1234",
        caller_number: "unknown"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      needs_phone: true,
      message: "请让用户一位一位说一下联系电话。"
    });
  });

  it("does not use anonymous or private caller numbers", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/submit-visitor",
      payload: {
        plate_number: "沪A12345",
        target_company: "蓝色鲸鱼",
        visit_reason: "送货",
        caller_number: "private",
        call_id: "private-caller-submit"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: false,
      status: "missing_or_invalid_fields"
    });
    expect(await prisma.visitorLog.findUnique({ where: { callId: "private-caller-submit" } })).toBeNull();
  });
});
