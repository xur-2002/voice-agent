import type { LookupReturningVisitorInput, SubmitVisitorInput } from "../types.js";

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function readString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

export function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function hasAnySubmitField(record: Record<string, unknown>) {
  return Boolean(
    record.plate_number ??
      record.plateNumber ??
      record.target_company ??
      record.targetCompany ??
      record.phone ??
      record.visit_reason ??
      record.visitReason
  );
}

export function hasAnyLookupField(record: Record<string, unknown>) {
  return Boolean(record.caller_number ?? record.callerNumber ?? record.phone ?? record.plate_number ?? record.plateNumber);
}

export function toSubmitVisitorInput(value: unknown, fallback: Partial<SubmitVisitorInput> = {}): SubmitVisitorInput {
  const record = asRecord(parseMaybeJson(value)) ?? {};
  const confidence = asRecord(record.confidence);

  return {
    plate_number: readString(record.plate_number ?? record.plateNumber),
    target_company: readString(record.target_company ?? record.targetCompany),
    phone: readString(record.phone),
    visit_reason: readString(record.visit_reason ?? record.visitReason),
    caller_number: readString(record.caller_number ?? record.callerNumber) ?? fallback.caller_number,
    call_id: readString(record.call_id ?? record.callId) ?? fallback.call_id,
    raw_summary: readString(record.raw_summary ?? record.rawSummary) ?? fallback.raw_summary,
    confidence: confidence
      ? {
          plate_number: numberOrUndefined(confidence.plate_number ?? confidence.plateNumber),
          target_company: numberOrUndefined(confidence.target_company ?? confidence.targetCompany),
          phone: numberOrUndefined(confidence.phone),
          visit_reason: numberOrUndefined(confidence.visit_reason ?? confidence.visitReason)
        }
      : fallback.confidence
  };
}

export function toLookupReturningVisitorInput(
  value: unknown,
  fallback: Partial<LookupReturningVisitorInput> = {}
): LookupReturningVisitorInput {
  const record = asRecord(parseMaybeJson(value)) ?? {};

  return {
    caller_number: readString(record.caller_number ?? record.callerNumber) ?? fallback.caller_number,
    phone: readString(record.phone) ?? fallback.phone,
    plate_number: readString(record.plate_number ?? record.plateNumber) ?? fallback.plate_number
  };
}

function numberOrUndefined(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
