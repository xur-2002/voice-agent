import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { lookupReturningVisitor } from "../src/services/visitorService.js";

const prisma = new PrismaClient();

describe("returning visitor lookup", () => {
  beforeEach(async () => {
    await prisma.visitorProfile.deleteMany();
    await prisma.visitorLog.deleteMany();
    await prisma.visitorLog.createMany({
      data: [
        {
          plateNumber: "沪A12345",
          targetCompany: "蓝色鲸鱼科技",
          phone: "13812341234",
          visitReason: "送货",
          callerNumber: "+13145550000",
          status: "mock-sent",
          entryTime: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
        },
        {
          plateNumber: "沪A12345",
          targetCompany: "蓝色鲸鱼科技",
          phone: "13812341234",
          visitReason: "维修",
          callerNumber: "+13145550000",
          status: "mock-sent",
          entryTime: new Date()
        }
      ]
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns the latest match by caller number", async () => {
    const result = await lookupReturningVisitor({ caller_number: "+13145550000" }, prisma);

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.profile.visit_count).toBe(2);
      expect(result.profile.visit_reason).toBe("维修");
      expect(result.profile.suggested_greeting).toContain("蓝色鲸鱼科技");
    }
  });

  it("returns matches by phone and plate number", async () => {
    const byPhone = await lookupReturningVisitor({ phone: "13812341234" }, prisma);
    const byPlate = await lookupReturningVisitor({ plate_number: "沪 A 12345" }, prisma);

    expect(byPhone.found).toBe(true);
    expect(byPlate.found).toBe(true);
    if (byPhone.found && byPlate.found) {
      expect(byPhone.profile.plate_number).toBe("沪A12345");
      expect(byPlate.profile.phone).toBe("13812341234");
    }
  });
});
