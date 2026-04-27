import { describe, expect, it } from "vitest";
import {
  isValidPhone,
  normalizeCompany,
  normalizePhone,
  normalizePlateNumber,
  normalizeVisitReason
} from "../src/services/normalization.js";

describe("normalization", () => {
  it("normalizes spoken plate numbers", () => {
    expect(normalizePlateNumber("  沪 a 幺二三四五 ")).toBe("沪A12345");
  });

  it("repairs common Shanghai plate ASR artifacts", () => {
    expect(normalizePlateNumber("?A12345")).toBe("沪A12345");
    expect(normalizePlateNumber("互为12345")).toBe("沪A12345");
    expect(normalizePlateNumber("沪 A 12345")).toBe("沪A12345");
    expect(normalizePlateNumber("沪，A，一二三四五")).toBe("沪A12345");
    expect(normalizePlateNumber("上海 A 12345")).toBe("沪A12345");
    expect(normalizePlateNumber("沪诶12345")).toBe("沪A12345");
    expect(normalizePlateNumber("户A12345")).toBe("沪A12345");
    expect(normalizePlateNumber("护A12345")).toBe("沪A12345");
  });

  it("normalizes and validates Chinese mobile numbers", () => {
    expect(normalizePhone("+86 138-1234-1234")).toBe("13812341234");
    expect(normalizePhone("一三三八六六五二五一零")).toBe("13386652510");
    expect(normalizePhone("一三三，八六六，五二五，一零")).toBe("13386652510");
    expect(normalizePhone("133 866 525 10")).toBe("13386652510");
    expect(normalizePhone("133，866，525，10")).toBe("13386652510");
    expect(normalizePhone("手机号是一三三八六六五二五一零")).toBe("13386652510");
    expect(normalizePhone("我的手机号是 133 866 525 10")).toBe("13386652510");
    expect(normalizePhone("幺三三八六六五二五一零")).toBe("13386652510");
    expect(isValidPhone("13812341234")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
    expect(isValidPhone("138xxxx1234")).toBe(false);
  });

  it("maps common visit reasons", () => {
    expect(normalizeVisitReason("送货的")).toBe("送货");
    expect(normalizeVisitReason("来面试")).toBe("面试");
    expect(normalizeVisitReason("找人开会")).toBe("拜访");
    expect(normalizeVisitReason("维护设备")).toBe("维修");
    expect(normalizeVisitReason("别的事")).toBe("其他");
  });

  it("maps common company aliases", async () => {
    await expect(normalizeCompany("蓝色金鱼")).resolves.toBe("蓝色鲸鱼科技");
    await expect(normalizeCompany("蓝色鲸鱼")).resolves.toBe("蓝色鲸鱼科技");
    await expect(normalizeCompany("蓝鲸")).resolves.toBe("蓝色鲸鱼科技");
  });
});
