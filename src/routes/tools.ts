import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { parseDirectLookupPayload, parseDirectSubmitVisitorPayload } from "../adapters/direct.js";
import { parseRetellLookupPayload, parseRetellSubmitVisitorPayload } from "../adapters/retell.js";
import { parseVapiLookupPayload, parseVapiSubmitVisitorPayload } from "../adapters/vapi.js";
import { lookupReturningVisitor, submitVisitor } from "../services/visitorService.js";

interface ToolRouteDeps {
  prisma: PrismaClient;
  wecomWebhookUrl?: string;
}

export function registerToolRoutes(app: FastifyInstance, deps: ToolRouteDeps) {
  app.post("/tools/submit-visitor", async (request, reply) => {
    const vapi = parseVapiSubmitVisitorPayload(request.body);
    if (vapi) {
      const results = [];
      for (const call of vapi.calls) {
        const response = await submitVisitor(call.input, {
          prisma: deps.prisma,
          logger: request.log,
          wecomWebhookUrl: deps.wecomWebhookUrl
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
      wecomWebhookUrl: deps.wecomWebhookUrl
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
}
