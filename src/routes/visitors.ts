import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { listVisitors } from "../services/visitorService.js";

const visitorQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  plate_number: z.string().optional(),
  phone: z.string().optional(),
  target_company: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

export function registerVisitorRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/visitors", async (request, reply) => {
    const parsed = visitorQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        message: "查询参数无效。",
        issues: parsed.error.issues
      });
    }

    return reply.send({
      visitors: await listVisitors(prisma, parsed.data)
    });
  });
}
