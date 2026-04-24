import type { VisitorLog } from "@prisma/client";
import { formatShanghaiTime } from "../utils/time.js";

interface LoggerLike {
  warn: (obj: object, msg?: string) => void;
  info: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export interface WeComResult {
  ok: boolean;
  mock: boolean;
  sentAt?: Date;
  error?: string;
}

export interface WeComOptions {
  webhookUrl?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  logger?: LoggerLike;
}

export async function sendVisitorWeComMessage(visitor: VisitorLog, options: WeComOptions = {}): Promise<WeComResult> {
  const webhookUrl = options.webhookUrl ?? process.env.WECOM_WEBHOOK_URL ?? "";
  const logger = options.logger;

  if (!webhookUrl) {
    logger?.warn({ service: "wecom" }, "WECOM_WEBHOOK_URL missing; using mock-sent mode");
    return { ok: true, mock: true, sentAt: new Date() };
  }

  const timeoutMs = options.timeoutMs ?? 5000;
  const maxAttempts = options.maxAttempts ?? 2;
  const payload = {
    msgtype: "markdown",
    markdown: {
      content: formatVisitorMarkdown(visitor)
    }
  };

  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const text = await response.text();
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`WeCom HTTP ${response.status}: ${text.slice(0, 160)}`);
      }

      const data = tryParseJson(text);
      if (data && typeof data.errcode === "number" && data.errcode !== 0) {
        throw new Error(`WeCom errcode ${data.errcode}: ${String(data.errmsg ?? "unknown error")}`);
      }

      logger?.info({ service: "wecom", attempt }, "WeCom notification sent");
      return { ok: true, mock: false, sentAt: new Date() };
    } catch (error) {
      clearTimeout(timeout);
      lastError = error instanceof Error ? error.message : String(error);
      logger?.warn({ service: "wecom", attempt, error: lastError }, "WeCom notification attempt failed");
    }
  }

  logger?.error({ service: "wecom", error: lastError }, "WeCom notification failed");
  return { ok: false, mock: false, error: lastError || "WeCom notification failed" };
}

export function formatVisitorMarkdown(visitor: Pick<VisitorLog, "plateNumber" | "targetCompany" | "phone" | "visitReason" | "entryTime">) {
  return [
    "## 🚗 新访客车辆登记",
    "",
    `车牌号：${visitor.plateNumber}  `,
    `来访单位：${visitor.targetCompany}  `,
    `手机号：${visitor.phone}  `,
    `来访事由：${visitor.visitReason}  `,
    `入场时间：${formatShanghaiTime(visitor.entryTime)}  `,
    "",
    "状态：待确认放行"
  ].join("\n");
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
