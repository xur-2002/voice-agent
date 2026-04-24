import type { LookupReturningVisitorInput, ParsedToolCalls, SubmitVisitorInput } from "../types.js";
import { asRecord, parseMaybeJson, readString, toLookupReturningVisitorInput, toSubmitVisitorInput } from "./helpers.js";

const SUBMIT_TOOL_NAMES = new Set(["submitvisitor", "submitvisitortool", "submitvisitorregistration"]);
const LOOKUP_TOOL_NAMES = new Set(["lookupreturningvisitor", "lookupvisitor", "lookupreturningvisitortool"]);

export function parseVapiSubmitVisitorPayload(body: unknown): ParsedToolCalls<SubmitVisitorInput> | null {
  const calls = getVapiCalls(body)
    .filter((call) => matchesToolName(call.name, SUBMIT_TOOL_NAMES))
    .map((call) => ({
      toolCallId: call.toolCallId,
      name: call.name,
      input: toSubmitVisitorInput(call.input, {
        call_id: call.fallbackCallId,
        caller_number: call.fallbackCallerNumber,
        raw_summary: call.fallbackSummary
      })
    }));

  return calls.length > 0 ? { provider: "vapi", calls } : null;
}

export function parseVapiLookupPayload(body: unknown): ParsedToolCalls<LookupReturningVisitorInput> | null {
  const calls = getVapiCalls(body)
    .filter((call) => matchesToolName(call.name, LOOKUP_TOOL_NAMES))
    .map((call) => ({
      toolCallId: call.toolCallId,
      name: call.name,
      input: toLookupReturningVisitorInput(call.input, {
        caller_number: call.fallbackCallerNumber
      })
    }));

  return calls.length > 0 ? { provider: "vapi", calls } : null;
}

interface RawVapiCall {
  toolCallId: string;
  name?: string;
  input: unknown;
  fallbackCallId?: string;
  fallbackCallerNumber?: string;
  fallbackSummary?: string;
}

function getVapiCalls(body: unknown): RawVapiCall[] {
  const root = asRecord(body);
  if (!root) return [];

  const message = asRecord(root.message);
  const list =
    asArray(root.toolCallList) ??
    asArray(root.toolCalls) ??
    asArray(message?.toolCallList) ??
    asArray(message?.toolCalls) ??
    asArray(message?.tool_calls);

  if (!list) return [];

  const callId =
    readString(root.call_id ?? root.callId) ??
    readString(message?.call_id ?? message?.callId) ??
    readString(asRecord(message?.call)?.id);
  const callerNumber =
    readString(root.caller_number ?? root.callerNumber) ??
    readString(message?.caller_number ?? message?.callerNumber) ??
    readString(asRecord(message?.customer)?.number);
  const summary = readString(root.raw_summary ?? root.rawSummary ?? message?.summary);

  return list.flatMap((item): RawVapiCall[] => {
    const call = asRecord(item);
    if (!call) return [];
    const fn = asRecord(call.function);
    const tool = asRecord(call.tool);
    const functionCall = asRecord(call.functionCall);
    const name = readString(call.name ?? fn?.name ?? tool?.name ?? call.functionName);
    const toolCallId = readString(call.toolCallId ?? call.id ?? call.callId) ?? crypto.randomUUID();
    const input = parseMaybeJson(
      call.arguments ??
        call.args ??
        call.input ??
        call.parameters ??
        fn?.arguments ??
        fn?.parameters ??
        functionCall?.arguments
    );

    return [
      {
        toolCallId,
        name,
        input,
        fallbackCallId: callId,
        fallbackCallerNumber: callerNumber,
        fallbackSummary: summary
      }
    ];
  });
}

function matchesToolName(name: string | undefined, allowed: Set<string>) {
  if (!name) return true;
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return allowed.has(normalized);
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}
