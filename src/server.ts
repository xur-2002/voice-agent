import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./db.js";
import { env } from "./env.js";
import { registerCallEventRoutes } from "./routes/callEvents.js";
import { registerGuardRoutes } from "./routes/guard.js";
import { registerToolRoutes } from "./routes/tools.js";
import { registerVisitorRoutes } from "./routes/visitors.js";
import { nowIso } from "./utils/time.js";

interface BuildAppOptions {
  prisma?: PrismaClient;
  logger?: FastifyServerOptions["logger"];
  wecomWebhookUrl?: string;
  publicBaseUrl?: string;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger:
      options.logger ??
      (env.NODE_ENV === "test"
        ? false
        : {
            level: env.NODE_ENV === "production" ? "info" : "debug"
          })
  });
  const prisma = options.prisma ?? defaultPrisma;
  const wecomWebhookUrl = options.wecomWebhookUrl ?? env.WECOM_WEBHOOK_URL;
  const publicBaseUrl = options.publicBaseUrl ?? env.PUBLIC_BASE_URL;

  app.register(cors, { origin: true });

  app.get("/health", async () => ({
    ok: true,
    service: "voice-agent",
    time: nowIso()
  }));

  registerToolRoutes(app, { prisma, wecomWebhookUrl, publicBaseUrl });
  registerVisitorRoutes(app, prisma);
  registerGuardRoutes(app, prisma);
  registerCallEventRoutes(app, prisma);

  app.addHook("onClose", async () => {
    if (!options.prisma) await prisma.$disconnect();
  });

  return app;
}
