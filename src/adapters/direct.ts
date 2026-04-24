import type { LookupReturningVisitorInput, ParsedSingleTool, SubmitVisitorInput } from "../types.js";
import { asRecord, hasAnyLookupField, hasAnySubmitField, toLookupReturningVisitorInput, toSubmitVisitorInput } from "./helpers.js";

export function parseDirectSubmitVisitorPayload(body: unknown): ParsedSingleTool<SubmitVisitorInput> | null {
  const record = asRecord(body);
  if (!record || record.toolCallList || record.toolCalls || record.message) return null;
  if (!hasAnySubmitField(record)) return null;
  return { provider: "direct", input: toSubmitVisitorInput(record) };
}

export function parseDirectLookupPayload(body: unknown): ParsedSingleTool<LookupReturningVisitorInput> | null {
  const record = asRecord(body);
  if (!record || record.toolCallList || record.toolCalls || record.message) return null;
  if (!hasAnyLookupField(record)) return null;
  return { provider: "direct", input: toLookupReturningVisitorInput(record) };
}
