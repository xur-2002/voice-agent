import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { parseDirectLookupPayload, parseDirectSubmitVisitorPayload } from "../adapters/direct.js";
import { parseRetellLookupPayload, parseRetellSubmitVisitorPayload } from "../adapters/retell.js";
import { parseVapiLookupPayload, parseVapiSubmitVisitorPayload } from "../adapters/vapi.js";
import {
  lookupReturningVisitor,
  resolveContactPhoneForVoice,
  submitVisitor,
  validatePhoneForVoice
} from "../services/visitorService.js";

interface ToolRouteDeps {
  prisma: PrismaClient;
  wecomWebhookUrl?: string;
  publicBaseUrl?: string;
}

const validatePhoneSchema = z.object({
  phone: z.string().min(1),
  call_id: z.string().optional()
});

const phoneDigitsSchema = z.object({
  digits: z.string().min(1),
  call_id: z.string().optional(),
  source: z.string().optional()
});

const resolveContactPhoneSchema = z.object({
  phone: z.string().optional(),
  caller_number: z.string().optional(),
  confirmed_use_caller_number: z.boolean().optional().default(false)
});

export function registerToolRoutes(app: FastifyInstance, deps: ToolRouteDeps) {
  app.post("/tools/submit-visitor", async (request, reply) => {
    const vapi = parseVapiSubmitVisitorPayload(request.body);
    if (vapi) {
      const results = [];
      for (const call of vapi.calls) {
        const response = await submitVisitor(call.input, {
          prisma: deps.prisma,
          logger: request.log,
          wecomWebhookUrl: deps.wecomWebhookUrl,
          publicBaseUrl: deps.publicBaseUrl
        });
        results.push({
          toolCallId: call.toolCallId,
          result: JSON.stringify(response.result)
        });
      }
      return reply.send({ results });
    }

    const parsed = parseRetellSubmitVisitorPayload(request.body) ?? parseDirectSubmitVisitorPayload(request.body);
    if (!parsed) {
      return reply.code(400).send({
        ok: false,
        status: "bad_request",
        message: "无法解析访客登记工具参数。"
      });
    }

    const response = await submitVisitor(parsed.input, {
      prisma: deps.prisma,
      logger: request.log,
      wecomWebhookUrl: deps.wecomWebhookUrl,
      publicBaseUrl: deps.publicBaseUrl
    });
    return reply.code(response.httpStatus).send(response.result);
  });

  app.post("/tools/lookup-returning-visitor", async (request, reply) => {
    const vapi = parseVapiLookupPayload(request.body);
    if (vapi) {
      const results = [];
      for (const call of vapi.calls) {
        const result = await lookupReturningVisitor(call.input, deps.prisma);
        results.push({
          toolCallId: call.toolCallId,
          result: JSON.stringify(result)
        });
      }
      return reply.send({ results });
    }

    const parsed = parseRetellLookupPayload(request.body) ?? parseDirectLookupPayload(request.body);
    if (!parsed) {
      return reply.code(400).send({
        found: false,
        message: "无法解析回访查询工具参数。"
      });
    }

    return reply.send(await lookupReturningVisitor(parsed.input, deps.prisma));
  });

  app.post("/tools/validate-phone", async (request, reply) => {
    const parsed = validatePhoneSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: true,
        valid: false,
        message: "手机号没有识别清楚，请让用户一位一位重复，或者改用按键输入。"
      });
    }

    request.log.info({ call_id: parsed.data.call_id }, "validate phone tool called");
    return reply.send(validatePhoneForVoice(parsed.data.phone));
  });

  app.post("/tools/phone-digits", async (request, reply) => {
    const parsed = phoneDigitsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: true,
        valid: false,
        message: "手机号没有识别清楚，请让用户一位一位重复，或者改用按键输入。"
      });
    }

    request.log.info(
      { call_id: parsed.data.call_id, source: parsed.data.source ?? "unknown" },
      "phone digits tool called"
    );
    return reply.send(validatePhoneForVoice(parsed.data.digits));
  });

  app.post("/tools/resolve-contact-phone", async (request, reply) => {
    const parsed = resolveContactPhoneSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: true,
        needs_phone: true,
        message: "请让用户一位一位说一下联系电话。"
      });
    }

    return reply.send(resolveContactPhoneForVoice(parsed.data));
  });
}
