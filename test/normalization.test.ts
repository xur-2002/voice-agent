import { describe, expect, it } from "vitest";
import {
  isValidPhone,
  normalizePhone,
  normalizePlateNumber,
  normalizeVisitReason
} from "../src/services/normalization.js";

describe("normalization", () => {
  it("normalizes spoken plate numbers", () => {
    expect(normalizePlateNumber("  沪 a 幺二三四五 ")).toBe("沪A12345");
  });

  it("normalizes and validates Chinese mobile numbers", () => {
    expect(normalizePhone("+86 138-1234-1234")).toBe("13812341234");
    expect(isValidPhone("13812341234")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
  });

  it("maps common visit reasons", () => {
    expect(normalizeVisitReason("送货的")).toBe("送货");
    expect(normalizeVisitReason("来面试")).toBe("面试");
    expect(normalizeVisitReason("找人开会")).toBe("拜访");
    expect(normalizeVisitReason("维护设备")).toBe("维修");
    expect(normalizeVisitReason("别的事")).toBe("其他");
  });
});
