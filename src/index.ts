import { buildApp } from "./server.js";
import { env } from "./env.js";

const app = buildApp();

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info({ port: env.PORT }, "voice-agent service listening");
} catch (error) {
  app.log.error(error, "failed to start voice-agent service");
  process.exit(1);
}

const shutdown = async (signal: NodeJS.Signals) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
