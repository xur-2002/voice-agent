import type { FastifyBaseLogger } from "fastify";
import type { VisitorLog } from "@prisma/client";

export interface GateControlResult {
  ok: boolean;
  mode: "mock";
}

export async function openGateForVisitor(visitor: VisitorLog, logger?: FastifyBaseLogger): Promise<GateControlResult> {
  // Production deployments can replace this adapter with a Hikvision gate API,
  // parking barrier controller API, or site-specific relay controller.
  logger?.info(
    {
      event: "MOCK_GATE_OPEN",
      visitor_id: visitor.id,
      plate_number: visitor.plateNumber
    },
    "mock gate open"
  );
  return { ok: true, mode: "mock" };
}
