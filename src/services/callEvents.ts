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
  const detectedDtmfDigits = findDtmfDigitHints(body);
  const payload = detectedDtmfDigits.length > 0 && asRecord(body) ? { ...record, detected_dtmf_digits: detectedDtmfDigits } : body;

  const stored = await prisma.callEvent.create({
    data: {
      provider,
      callId,
      eventType,
      payload: payload as object
    }
  });

  return {
    ok: true,
    stored: knownEvents.has(eventType) || eventType !== "unknown",
    event_id: stored.id,
    event_type: eventType,
    dtmf_digits_detected: detectedDtmfDigits.length > 0
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

function findDtmfDigitHints(value: unknown, depth = 0): string[] {
  if (depth > 6 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => findDtmfDigitHints(item, depth + 1));
  const record = asRecord(value);
  if (!record) return [];

  const matches: string[] = [];
  for (const [key, raw] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase();
    if (["digit", "digits", "dtmf", "keypad", "input"].includes(normalizedKey)) {
      const text = readString(raw);
      const digits = text?.replace(/[^\d#*]/g, "");
      if (digits) matches.push(digits);
    }
    matches.push(...findDtmfDigitHints(raw, depth + 1));
  }
  return [...new Set(matches)];
}
