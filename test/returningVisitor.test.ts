import { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { lookupReturningVisitor } from "../src/services/visitorService.js";

const prisma = new PrismaClient();

describe("returning visitor lookup", () => {
  beforeEach(async () => {
    await prisma.visitorProfile.deleteMany();
    await prisma.visitorLog.deleteMany();
  });

  it("returns the latest matching visitor from the last 30 days", async () => {
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

    const result = await lookupReturningVisitor({ caller_number: "+13145550000" }, prisma);

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.profile.visit_count).toBe(2);
      expect(result.profile.visit_reason).toBe("维修");
      expect(result.profile.suggested_greeting).toContain("蓝色鲸鱼科技");
    }
  });
});
