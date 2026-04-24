import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { storeCallEvent } from "../services/callEvents.js";

export function registerCallEventRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.post("/webhooks/call-events", async (request, reply) => {
    const result = await storeCallEvent(request.body, prisma);
    return reply.send(result);
  });
}
