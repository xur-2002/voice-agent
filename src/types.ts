import type { VisitorLog } from "@prisma/client";

export type SubmitField = "plate_number" | "target_company" | "phone" | "visit_reason";

export type FieldConfidence = Partial<Record<SubmitField, number>>;

export interface SubmitVisitorInput {
  plate_number?: string;
  target_company?: string;
  phone?: string;
  visit_reason?: string;
  caller_number?: string;
  call_id?: string;
  raw_summary?: string;
  confidence?: FieldConfidence;
}

export interface NormalizedSubmitVisitorInput {
  plateNumber: string;
  targetCompany: string;
  phone: string;
  visitReason: string;
  callerNumber?: string;
  callId?: string;
  rawSummary?: string;
}

export interface LookupReturningVisitorInput {
  caller_number?: string;
  phone?: string;
  plate_number?: string;
}

export interface ToolCall<TInput> {
  toolCallId: string;
  name?: string;
  input: TInput;
}

export interface ParsedToolCalls<TInput> {
  provider: "vapi";
  calls: ToolCall<TInput>[];
}

export interface ParsedSingleTool<TInput> {
  provider: "direct" | "retell";
  input: TInput;
}

export type ParsedToolPayload<TInput> = ParsedToolCalls<TInput> | ParsedSingleTool<TInput>;

export interface SubmitVisitorSuccess {
  ok: true;
  status: "notified" | "mock-sent" | "idempotent";
  visitor_id: string;
  message: string;
  idempotent?: boolean;
}

export interface SubmitVisitorNeedsConfirmation {
  ok: false;
  status: "needs_confirmation";
  field: SubmitField;
  message: string;
}

export interface SubmitVisitorInvalid {
  ok: false;
  status: "missing_or_invalid_fields";
  fields: SubmitField[];
  message: string;
}

export interface SubmitVisitorNotificationFailed {
  ok: false;
  status: "notification_failed";
  visitor_id: string;
  message: string;
  error: string;
}

export type SubmitVisitorResult =
  | SubmitVisitorSuccess
  | SubmitVisitorNeedsConfirmation
  | SubmitVisitorInvalid
  | SubmitVisitorNotificationFailed;

export type PublicVisitorLog = {
  id: string;
  plate_number: string;
  target_company: string;
  phone: string;
  visit_reason: string;
  caller_number?: string;
  entry_time: string;
  call_id?: string;
  raw_summary?: string;
  status: string;
  wecom_sent_at?: string;
  wecom_error?: string;
};

export function toPublicVisitorLog(visitor: VisitorLog): PublicVisitorLog {
  return {
    id: visitor.id,
    plate_number: visitor.plateNumber,
    target_company: visitor.targetCompany,
    phone: visitor.phone,
    visit_reason: visitor.visitReason,
    caller_number: visitor.callerNumber ?? undefined,
    entry_time: visitor.entryTime.toISOString(),
    call_id: visitor.callId ?? undefined,
    raw_summary: visitor.rawSummary ?? undefined,
    status: visitor.status,
    wecom_sent_at: visitor.wecomSentAt?.toISOString(),
    wecom_error: visitor.wecomError ?? undefined
  };
}
