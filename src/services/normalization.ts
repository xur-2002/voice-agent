import type { PrismaClient } from "@prisma/client";

const digitSpeechMap: Record<string, string> = {
  零: "0",
  洞: "0",
  幺: "1",
  一: "1",
  二: "2",
  两: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9"
};

const plateLetterSpeechMap: Record<string, string> = {
  诶: "A",
  欸: "A"
};

const phoneDigitSpeechMap: Record<string, string> = {
  零: "0",
  〇: "0",
  一: "1",
  幺: "1",
  二: "2",
  两: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9"
};

const builtInCompanyAliases = new Map([
  ["蓝色金鱼", "蓝色鲸鱼科技"],
  ["蓝色鲸鱼", "蓝色鲸鱼科技"],
  ["蓝鲸", "蓝色鲸鱼科技"],
  ["蓝鲸科技", "蓝色鲸鱼科技"],
  ["星河智能", "星河智能制造有限公司"],
  ["星河", "星河智能制造有限公司"]
]);

export function normalizePlateNumber(input: string) {
  let value = input
    .trim()
    .replace(/[，,。.\s\-—_/]/g, "")
    .replace(/车牌号是?|车牌是?|牌照是?|我的车牌|号码/g, "");

  value = Array.from(value)
    .map((char) => plateLetterSpeechMap[char] ?? digitSpeechMap[char] ?? char)
    .join("")
    .toUpperCase();

  return normalizeShanghaiPlateArtifacts(value);
}

function normalizeShanghaiPlateArtifacts(value: string) {
  if (/^上海[A-Z]\d{5}$/.test(value)) return value.replace(/^上海/, "沪");
  if (/^互为\d{5}$/.test(value)) return value.replace(/^互为/, "沪A");
  if (/^互为[A-Z]\d{5}$/.test(value)) return value.replace(/^互为/, "沪");
  if (/^[户护沪?][A-Z]\d{5}$/.test(value)) return value.replace(/^[户护沪?]/, "沪");
  return value;
}

export function normalizePhone(input: string) {
  if (hasMaskedPhonePlaceholder(input)) {
    return input.trim().replace(/\s/g, "");
  }

  const spokenAsDigits = Array.from(removePhoneFillers(input.trim()))
    .map((char) => phoneDigitSpeechMap[char] ?? normalizeFullWidthDigit(char))
    .join("");

  const compact = spokenAsDigits.replace(/[^\d+]/g, "");
  if (compact.startsWith("+86") && /^(\+86)1\d{10}$/.test(compact)) {
    return compact.slice(3);
  }
  if (/^861\d{10}$/.test(compact)) {
    return compact.slice(2);
  }
  return compact;
}

export function isValidPhone(input: string) {
  if (hasMaskedPhonePlaceholder(input)) return false;
  const phone = normalizePhone(input);
  return /^1\d{10}$/.test(phone) || /^\+1\d{10}$/.test(phone) || /^\+\d{8,15}$/.test(phone);
}

export function hasMaskedPhonePlaceholder(input: string) {
  return /[xX*＊]/.test(input);
}

function removePhoneFillers(input: string) {
  return input.replace(/手机号|电话|我的|是|号码|联系方式|逗号|空格/g, "");
}

function normalizeFullWidthDigit(char: string) {
  const code = char.charCodeAt(0);
  if (code >= 0xff10 && code <= 0xff19) {
    return String(code - 0xff10);
  }
  return char;
}

export function normalizeVisitReason(input: string) {
  const value = input.trim().replace(/\s/g, "");
  if (!value) return "其他";

  if (/(送东西|送货|送货的|配送|快递|货物|卸货)/.test(value)) return "送货";
  if (/(面试|来面试|应聘|找工作)/.test(value)) return "面试";
  if (/(拜访|找人|开会|见客户|谈事|洽谈)/.test(value)) return "拜访";
  if (/(修东西|维修|维护|检修|保养|修理)/.test(value)) return "维修";
  return "其他";
}

export async function normalizeCompany(input: string, prisma?: PrismaClient) {
  const cleaned = input.trim().replace(/\s/g, "");
  if (!cleaned) return cleaned;

  const builtIn = builtInCompanyAliases.get(cleaned);
  if (builtIn) return builtIn;

  if (prisma) {
    const alias = await prisma.companyAlias.findUnique({ where: { alias: cleaned } });
    if (alias) return alias.canonicalName;
  }

  return cleaned;
}

export function normalizeOptionalPhone(input?: string) {
  return input ? normalizePhone(input) : undefined;
}
