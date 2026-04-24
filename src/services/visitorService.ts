import type { PrismaClient, VisitorLog } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import type {
  LookupReturningVisitorInput,
  NormalizedSubmitVisitorInput,
  SubmitField,
  SubmitVisitorInput,
  SubmitVisitorInvalid,
  SubmitVisitorNeedsConfirmation,
  SubmitVisitorNotificationFailed,
  SubmitVisitorResult,
  SubmitVisitorSuccess
} from "../types.js";
import { toPublicVisitorLog } from "../types.js";
import { elapsedMs } from "../utils/time.js";
import {
  isValidPhone,
  normalizeCompany,
  normalizeOptionalPhone,
  normalizePhone,
  normalizePlateNumber,
  normalizeVisitReason
} from "./normalization.js";
import { sendVisitorWeComMessage } from "./wecom.js";

const SUCCESS_MESSAGE = "已通知门卫，请稍等放行。";
const VALIDATION_MESSAGES: Record<SubmitField, string> = {
  plate_number: "车牌号没有听清，请再说一遍车牌号。",
  target_company: "来访单位没有听清，请再说一遍要找哪家公司。",
  phone: "手机号没有听清，请再说一遍手机号。",
  visit_reason: "来访事由没有听清，请再说一遍来做什么事。"
};

interface VisitorServiceDeps {
  prisma: PrismaClient;
  logger: FastifyBaseLogger;
  wecomWebhookUrl?: string;
}

export interface SubmitVisitorServiceResponse {
  result: SubmitVisitorResult;
  httpStatus: number;
}

export async function submitVisitor(
  input: SubmitVisitorInput,
  deps: VisitorServiceDeps
): Promise<SubmitVisitorServiceResponse> {
  const requestStartedAt = process.hrtime.bigint();
  deps.logger.info({ request_received_at: new Date().toISOString(), call_id: input.call_id }, "submit visitor request received");

  const callId = input.call_id?.trim() || undefined;
  if (callId) {
    const existing = await deps.prisma.visitorLog.findUnique({ where: { callId } });
    if (existing) {
      deps.logger.info(
        {
          call_id: callId,
          visitor_id: existing.id,
          total_ms: elapsedMs(requestStartedAt).toFixed(1)
        },
        "idempotent visitor submission returned existing record"
      );
      return {
        httpStatus: 200,
        result: {
          ok: true,
          status: "idempotent",
          visitor_id: existing.id,
          message: SUCCESS_MESSAGE,
          idempotent: true
        }
      };
    }
  }

  const validation = await normalizeAndValidate(input, deps.prisma);
  if (!validation.ok) {
    deps.logger.info(
      {
        status: validation.result.status,
        total_ms: elapsedMs(requestStartedAt).toFixed(1)
      },
      "submit visitor validation needs caller follow-up"
    );
    return { httpStatus: 200, result: validation.result };
  }

  const dbStartedAt = process.hrtime.bigint();
  const visitor = await deps.prisma.visitorLog.create({
    data: {
      plateNumber: validation.input.plateNumber,
      targetCompany: validation.input.targetCompany,
      phone: validation.input.phone,
      visitReason: validation.input.visitReason,
      callerNumber: validation.input.callerNumber,
      callId: validation.input.callId,
      rawSummary: validation.input.rawSummary,
      status: "pending"
    }
  });
  await updateVisitorProfile(visitor, deps.prisma);
  const dbSavedMs = elapsedMs(dbStartedAt);

  const wecomStartedAt = process.hrtime.bigint();
  const wecom = await sendVisitorWeComMessage(visitor, {
    webhookUrl: deps.wecomWebhookUrl,
    logger: deps.logger
  });
  const wecomSentMs = elapsedMs(wecomStartedAt);

  if (!wecom.ok) {
    const updated = await deps.prisma.visitorLog.update({
      where: { id: visitor.id },
      data: {
        status: "wecom_failed",
        wecomError: wecom.error ?? "WeCom notification failed"
      }
    });
    const result: SubmitVisitorNotificationFailed = {
      ok: false,
      status: "notification_failed",
      visitor_id: updated.id,
      message: "登记已保存，但企业微信群通知发送失败，请联系门卫确认。",
      error: updated.wecomError ?? "WeCom notification failed"
    };

    deps.logger.error(
      {
        visitor_id: visitor.id,
        db_saved_ms: dbSavedMs.toFixed(1),
        wecom_sent_ms: wecomSentMs.toFixed(1),
        total_ms: elapsedMs(requestStartedAt).toFixed(1),
        error: result.error
      },
      "submit visitor completed with WeCom failure"
    );

    return { httpStatus: 502, result };
  }

  const status = wecom.mock ? "mock-sent" : "notified";
  const updated = await deps.prisma.visitorLog.update({
    where: { id: visitor.id },
    data: {
      status,
      wecomSentAt: wecom.sentAt ?? new Date()
    }
  });

  const result: SubmitVisitorSuccess = {
    ok: true,
    status,
    visitor_id: updated.id,
    message: SUCCESS_MESSAGE
  };

  deps.logger.info(
    {
      visitor_id: visitor.id,
      db_saved_ms: dbSavedMs.toFixed(1),
      wecom_sent_ms: wecomSentMs.toFixed(1),
      total_ms: elapsedMs(requestStartedAt).toFixed(1)
    },
    "submit visitor completed"
  );

  return { httpStatus: 200, result };
}

export async function lookupReturningVisitor(input: LookupReturningVisitorInput, prisma: PrismaClient) {
  const phone = input.phone ? normalizePhone(input.phone) : undefined;
  const callerNumber = normalizeOptionalPhone(input.caller_number);
  const plateNumber = input.plate_number ? normalizePlateNumber(input.plate_number) : undefined;

  const or = [
    phone ? { phone } : undefined,
    callerNumber ? { callerNumber } : undefined,
    plateNumber ? { plateNumber } : undefined
  ].filter(Boolean) as Array<{ phone: string } | { callerNumber: string } | { plateNumber: string }>;

  if (or.length === 0) return { found: false as const };

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const where = {
    entryTime: { gte: since },
    OR: or
  };
  const latest = await prisma.visitorLog.findFirst({
    where,
    orderBy: { entryTime: "desc" }
  });

  if (!latest) return { found: false as const };

  const visitCount = await prisma.visitorLog.count({ where });
  return {
    found: true as const,
    profile: {
      plate_number: latest.plateNumber,
      target_company: latest.targetCompany,
      visit_reason: latest.visitReason,
      phone: latest.phone,
      last_visit_at: latest.entryTime.toISOString(),
      visit_count: visitCount,
      suggested_greeting: `您好，今天还是来${latest.targetCompany}${latest.visitReason}吗？`
    }
  };
}

export async function listVisitors(
  prisma: PrismaClient,
  query: {
    limit?: number;
    plate_number?: string;
    phone?: string;
    target_company?: string;
    from?: string;
    to?: string;
  }
) {
  const where = {
    ...(query.plate_number ? { plateNumber: normalizePlateNumber(query.plate_number) } : {}),
    ...(query.phone ? { phone: normalizePhone(query.phone) } : {}),
    ...(query.target_company ? { targetCompany: { contains: query.target_company.trim() } } : {}),
    ...buildDateWhere(query.from, query.to)
  };

  const visitors = await prisma.visitorLog.findMany({
    where,
    orderBy: { entryTime: "desc" },
    take: Math.min(Math.max(query.limit ?? 20, 1), 100)
  });

  return visitors.map(toPublicVisitorLog);
}

async function normalizeAndValidate(
  input: SubmitVisitorInput,
  prisma: PrismaClient
): Promise<
  | { ok: true; input: NormalizedSubmitVisitorInput }
  | { ok: false; result: SubmitVisitorInvalid | SubmitVisitorNeedsConfirmation }
> {
  const missingFields = requiredFields.filter((field) => !input[field]?.trim());
  if (missingFields.length > 0) {
    return {
      ok: false,
      result: {
        ok: false,
        status: "missing_or_invalid_fields",
        fields: missingFields,
        message: `缺少或无效字段：${missingFields.join(", ")}。`
      }
    };
  }

  const lowConfidenceField = findLowConfidenceField(input);
  if (lowConfidenceField) {
    return {
      ok: false,
      result: {
        ok: false,
        status: "needs_confirmation",
        field: lowConfidenceField,
        message: VALIDATION_MESSAGES[lowConfidenceField]
      }
    };
  }

  const plateNumber = normalizePlateNumber(input.plate_number ?? "");
  const phone = normalizePhone(input.phone ?? "");
  const targetCompany = await normalizeCompany(input.target_company ?? "", prisma);
  const visitReason = normalizeVisitReason(input.visit_reason ?? "");
  const invalidFields: SubmitField[] = [];

  if (plateNumber.length < 5) invalidFields.push("plate_number");
  if (!targetCompany) invalidFields.push("target_company");
  if (!isValidPhone(phone)) invalidFields.push("phone");
  if (!visitReason) invalidFields.push("visit_reason");

  if (invalidFields.length > 0) {
    return {
      ok: false,
      result: {
        ok: false,
        status: "missing_or_invalid_fields",
        fields: invalidFields,
        message: `缺少或无效字段：${invalidFields.join(", ")}。`
      }
    };
  }

  return {
    ok: true,
    input: {
      plateNumber,
      targetCompany,
      phone,
      visitReason,
      callerNumber: normalizeOptionalPhone(input.caller_number),
      callId: input.call_id?.trim() || undefined,
      rawSummary: input.raw_summary?.trim() || undefined
    }
  };
}

const requiredFields: SubmitField[] = ["plate_number", "target_company", "phone", "visit_reason"];

function findLowConfidenceField(input: SubmitVisitorInput): SubmitField | null {
  if (input.confidence?.plate_number !== undefined && input.confidence.plate_number < 0.75) return "plate_number";
  if (input.confidence?.phone !== undefined && input.confidence.phone < 0.85) return "phone";
  return null;
}

async function updateVisitorProfile(visitor: VisitorLog, prisma: PrismaClient) {
  const profile = await prisma.visitorProfile.findFirst({
    where: {
      OR: [
        { phone: visitor.phone },
        visitor.callerNumber ? { callerNumber: visitor.callerNumber } : undefined,
        { plateNumber: visitor.plateNumber }
      ].filter(Boolean) as Array<{ phone: string } | { callerNumber: string } | { plateNumber: string }>
    },
    orderBy: { updatedAt: "desc" }
  });

  const data = {
    phone: visitor.phone,
    callerNumber: visitor.callerNumber,
    plateNumber: visitor.plateNumber,
    targetCompany: visitor.targetCompany,
    visitReason: visitor.visitReason,
    lastVisitAt: visitor.entryTime
  };

  if (profile) {
    await prisma.visitorProfile.update({
      where: { id: profile.id },
      data: {
        ...data,
        visitCount: { increment: 1 }
      }
    });
    return;
  }

  await prisma.visitorProfile.create({
    data: {
      ...data,
      visitCount: 1
    }
  });
}

function buildDateWhere(from?: string, to?: string) {
  const entryTime: { gte?: Date; lte?: Date } = {};
  if (from) {
    const parsed = new Date(from);
    if (!Number.isNaN(parsed.getTime())) entryTime.gte = parsed;
  }
  if (to) {
    const parsed = new Date(to);
    if (!Number.isNaN(parsed.getTime())) entryTime.lte = parsed;
  }
  return Object.keys(entryTime).length > 0 ? { entryTime } : {};
}
