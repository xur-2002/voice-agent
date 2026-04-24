import type { PrismaClient } from "@prisma/client";
import { asRecord, readString } from "../adapters/helpers.js";

const knownEvents = new Set(["call_started", "call_ended", "call_analyzed", "transcript_updated", "tool-calls"]);

export async function storeCallEvent(body: unknown, prisma: PrismaClient) {
  const record = asRecord(body) ?? {};
  const message = asRecord(record.message);
  const call = asRecord(record.call ?? message?.call);
  const provider = readString(record.provider ?? record.source ?? message?.provider);
  const eventType = normalizeEventType(
    readString(record.eventType ?? record.event_type ?? record.type ?? message?.type ?? record.event) ?? "unknown"
  );
  const callId = readString(record.call_id ?? record.callId ?? call?.call_id ?? call?.id ?? message?.call_id ?? message?.callId);

  const stored = await prisma.callEvent.create({
    data: {
      provider,
      callId,
      eventType,
      payload: body as object
    }
  });

  return {
    ok: true,
    stored: knownEvents.has(eventType) || eventType !== "unknown",
    event_id: stored.id,
    event_type: eventType
  };
}

function normalizeEventType(value: string) {
  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "call-started" || normalized === "call.started") return "call_started";
  if (normalized === "call-ended" || normalized === "call.ended") return "call_ended";
  if (normalized === "call-analyzed" || normalized === "call.analyzed") return "call_analyzed";
  if (normalized === "transcript-updated" || normalized === "transcript.updated") return "transcript_updated";
  if (normalized === "tool-calls" || normalized === "tool.calls" || normalized === "tool-call") return "tool-calls";
  return value;
}
