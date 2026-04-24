import type { PrismaClient } from "@prisma/client";
import { normalizeCompany, normalizePhone, normalizePlateNumber } from "./normalization.js";

type Period = "today" | "week" | "month" | "last30";

export interface GuardQueryResult {
  answer: string;
  data: Record<string, unknown>;
}

export async function answerGuardQuestion(
  question: string,
  prisma: PrismaClient,
  now = new Date()
): Promise<GuardQueryResult> {
  const normalizedQuestion = question.trim();
  const period = detectPeriod(normalizedQuestion) ?? "today";
  const range = getDateRange(period, now);

  if (/什么时间段|哪个时间段|高峰|最多/.test(normalizedQuestion)) {
    return answerBusiestHour(prisma, range, period);
  }

  const phone = extractPhone(normalizedQuestion);
  const plateNumber = extractPlateNumber(normalizedQuestion);

  if (phone || plateNumber || /手机号|车牌/.test(normalizedQuestion)) {
    if (!phone && !plateNumber) {
      return {
        answer: "请在问题里包含具体手机号或车牌号。",
        data: { supported: true, reason: "missing_phone_or_plate" }
      };
    }

    const specificPeriod = detectPeriod(normalizedQuestion) ?? "last30";
    const specificRange = getDateRange(specificPeriod, now);
    const where = {
      entryTime: { gte: specificRange.start, lt: specificRange.end },
      ...(phone ? { phone } : {}),
      ...(plateNumber ? { plateNumber } : {})
    };
    const count = await prisma.visitorLog.count({ where });
    const subject = phone ? `手机号 ${phone}` : `车牌 ${plateNumber}`;
    return {
      answer: `${periodLabel(specificPeriod)}${subject}共有 ${count} 次访客登记。`,
      data: { count, period: specificPeriod, phone, plate_number: plateNumber }
    };
  }

  const company = await detectCompany(normalizedQuestion, prisma);
  const where = {
    entryTime: { gte: range.start, lt: range.end },
    ...(company ? { targetCompany: company } : {})
  };
  const count = await prisma.visitorLog.count({ where });

  if (company) {
    return {
      answer: `${company}${periodLabel(period)}共有 ${count} 辆访客车登记。`,
      data: { count, period, target_company: company }
    };
  }

  if (/多少|几辆|几次|一共|总共|数量/.test(normalizedQuestion)) {
    return {
      answer: `${periodLabel(period)}共有 ${count} 辆访客车登记。`,
      data: { count, period }
    };
  }

  return {
    answer: "当前支持查询今天、本周、本月访客数量，公司访客数量，手机号或车牌访问次数，以及访问最多的时间段。",
    data: { supported: false }
  };
}

function detectPeriod(question: string): Period | null {
  if (/今天|今日/.test(question)) return "today";
  if (/本周|这周|这一周/.test(question)) return "week";
  if (/本月|这个月|这月/.test(question)) return "month";
  if (/近30天|最近30天|最近三十天/.test(question)) return "last30";
  return null;
}

function getDateRange(period: Period, now: Date) {
  const start = new Date(now);
  const end = new Date(now);

  if (period === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
  } else if (period === "week") {
    start.setHours(0, 0, 0, 0);
    const day = start.getDay();
    start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  } else if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
  } else {
    start.setTime(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    end.setTime(now.getTime() + 1);
  }

  return { start, end };
}

function periodLabel(period: Period) {
  if (period === "today") return "今天";
  if (period === "week") return "本周";
  if (period === "month") return "本月";
  return "最近30天";
}

function extractPhone(question: string) {
  const match = question.replace(/[^\d+]/g, "").match(/(?:\+86)?1\d{10}|\+1\d{10}/);
  return match ? normalizePhone(match[0]) : undefined;
}

function extractPlateNumber(question: string) {
  const compact = question.replace(/\s/g, "").toUpperCase();
  const match = compact.match(/[\u4e00-\u9fa5][A-Z][A-Z0-9挂学警港澳领使试超]{4,6}/);
  return match ? normalizePlateNumber(match[0]) : undefined;
}

async function detectCompany(question: string, prisma: PrismaClient) {
  const aliases = await prisma.companyAlias.findMany();
  const companies = await prisma.visitorLog.findMany({
    distinct: ["targetCompany"],
    select: { targetCompany: true },
    take: 200
  });

  const candidates = [
    ...aliases.flatMap((alias) => [alias.alias, alias.canonicalName]),
    ...companies.map((company) => company.targetCompany)
  ]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const matched = candidates.find((candidate) => question.includes(candidate));
  return matched ? normalizeCompany(matched, prisma) : undefined;
}

async function answerBusiestHour(
  prisma: PrismaClient,
  range: { start: Date; end: Date },
  period: Period
): Promise<GuardQueryResult> {
  const visitors = await prisma.visitorLog.findMany({
    where: {
      entryTime: { gte: range.start, lt: range.end }
    },
    select: { entryTime: true }
  });

  if (visitors.length === 0) {
    return {
      answer: `${periodLabel(period)}还没有访客登记记录。`,
      data: { period, busiest_hour: null, count: 0 }
    };
  }

  const counts = new Map<number, number>();
  for (const visitor of visitors) {
    const hour = getShanghaiHour(visitor.entryTime);
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }

  const [hour, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const label = `${hour}:00-${hour + 1}:00`;
  return {
    answer: `${periodLabel(period)}访问最多的时间段是 ${label}，共有 ${count} 辆访客车登记。`,
    data: {
      period,
      busiest_hour: hour,
      label,
      count,
      histogram: Object.fromEntries([...counts.entries()].sort((a, b) => a[0] - b[0]))
    }
  };
}

function getShanghaiHour(date: Date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  return hour === 24 ? 0 : hour;
}
