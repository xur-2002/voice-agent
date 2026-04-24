import type { LookupReturningVisitorInput, ParsedSingleTool, SubmitVisitorInput } from "../types.js";
import {
  asRecord,
  hasAnyLookupField,
  hasAnySubmitField,
  parseMaybeJson,
  readString,
  toLookupReturningVisitorInput,
  toSubmitVisitorInput
} from "./helpers.js";

export function parseRetellSubmitVisitorPayload(body: unknown): ParsedSingleTool<SubmitVisitorInput> | null {
  const root = asRecord(body);
  if (!root || root.toolCallList || root.toolCalls) return null;

  const args = findRetellArgs(root);
  const argsRecord = asRecord(args);
  if (!argsRecord || !hasAnySubmitField(argsRecord)) return null;

  return {
    provider: "retell",
    input: toSubmitVisitorInput(argsRecord, {
      call_id: readRetellCallId(root),
      caller_number: readRetellCallerNumber(root),
      raw_summary: readString(root.raw_summary ?? root.rawSummary ?? root.transcript_summary)
    })
  };
}

export function parseRetellLookupPayload(body: unknown): ParsedSingleTool<LookupReturningVisitorInput> | null {
  const root = asRecord(body);
  if (!root || root.toolCallList || root.toolCalls) return null;

  const args = findRetellArgs(root);
  const argsRecord = asRecord(args);
  if (!argsRecord || !hasAnyLookupField(argsRecord)) return null;

  return {
    provider: "retell",
    input: toLookupReturningVisitorInput(argsRecord, {
      caller_number: readRetellCallerNumber(root)
    })
  };
}

function findRetellArgs(root: Record<string, unknown>) {
  const message = asRecord(root.message);
  const data = asRecord(root.data);
  const functionCall = asRecord(root.function_call ?? root.functionCall);
  return parseMaybeJson(
    root.args ??
      root.arguments ??
      root.parameters ??
      data?.args ??
      data?.arguments ??
      message?.args ??
      message?.arguments ??
      functionCall?.arguments
  );
}

function readRetellCallId(root: Record<string, unknown>) {
  const call = asRecord(root.call);
  return readString(root.call_id ?? root.callId ?? call?.call_id ?? call?.id);
}

function readRetellCallerNumber(root: Record<string, unknown>) {
  const call = asRecord(root.call);
  return readString(root.caller_number ?? root.callerNumber ?? root.from_number ?? call?.from_number ?? call?.fromNumber);
}
