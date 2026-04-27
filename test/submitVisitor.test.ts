import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("does not duplicate WeCom push for the same callId", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ errcode: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const webhookApp = buildApp({
      prisma,
      logger: false,
      wecomWebhookUrl: "https://wecom.example/webhook",
      wecomMaxAttempts: 1
    });
    await webhookApp.ready();

    const payload = {
      plate_number: "沪A12345",
      target_company: "蓝鲸",
      phone: "13812341234",
      visit_reason: "配送",
      call_id: "test-call-single-push"
    };

    try {
      const first = await webhookApp.inject({ method: "POST", url: "/tools/submit-visitor", payload });
      const second = await webhookApp.inject({ method: "POST", url: "/tools/submit-visitor", payload });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
      expect(second.json().status).toBe("idempotent");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await prisma.visitorLog.count({ where: { callId: "test-call-single-push" } })).toBe(1);
    } finally {
      await webhookApp.close();
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates separate records for different callIds", async () => {
    const basePayload = {
      plate_number: "沪A12345",
      target_company: "蓝鲸",
      phone: "13386652510",
      visit_reason: "送货"
    };

    const first = await app.inject({
      method: "POST",
      url: "/tools/submit-visitor",
      payload: { ...basePayload, call_id: "multi-call-001" }
    });
    const second = await app.inject({
      method: "POST",
      url: "/tools/submit-visitor",
      payload: { ...basePayload, call_id: "multi-call-002" }
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().ok).toBe(true);
    expect(second.json().ok).toBe(true);
    expect(await prisma.visitorLog.count({ where: { callId: { in: ["multi-call-001", "multi-call-002"] } } })).toBe(2);
  });

  it("keeps statuses isolated across different callIds", async () => {
    const basePayload = {
      plate_number: "沪A12345",
      target_company: "蓝鲸",
      phone: "13386652510",
      visit_reason: "送货"
    };

    await app.inject({
      method: "POST",
      url: "/tools/submit-visitor",
      payload: { ...basePayload, call_id: "status-call-001" }
    });
    await app.inject({
      method: "POST",
      url: "/tools/submit-visitor",
      payload: { ...basePayload, call_id: "status-call-002" }
    });

    const first = await prisma.visitorLog.findUniqueOrThrow({ where: { callId: "status-call-001" } });
    const second = await prisma.visitorLog.findUniqueOrThrow({ where: { callId: "status-call-002" } });
    const approve = await app.inject({
      method: "GET",
      url: `/guard/visitors/${first.id}/approve?token=${encodeURIComponent(first.actionToken ?? "")}`
    });

    expect(approve.statusCode).toBe(200);
    const updatedFirst = await prisma.visitorLog.findUniqueOrThrow({ where: { id: first.id } });
    const updatedSecond = await prisma.visitorLog.findUniqueOrThrow({ where: { id: second.id } });
    expect(updatedFirst.status).toBe("approved");
    expect(updatedSecond.status).toBe("mock-sent");
  });

  it("times out slow WeCom responses instead of waiting indefinitely", async () => {
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const webhookApp = buildApp({
      prisma,
      logger: false,
      wecomWebhookUrl: "https://wecom.example/slow",
      wecomTimeoutMs: 25,
      wecomMaxAttempts: 1
    });
    await webhookApp.ready();

    const startedAt = performance.now();
    try {
      const response = await webhookApp.inject({
        method: "POST",
        url: "/tools/submit-visitor",
        payload: {
          plate_number: "沪A12345",
          target_company: "蓝鲸",
          phone: "13386652510",
          visit_reason: "送货",
          call_id: "slow-wecom-timeout"
        }
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ ok: false, status: "notification_failed" });
      expect(performance.now() - startedAt).toBeLessThan(1000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await webhookApp.close();
    }
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
