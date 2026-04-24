import { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { answerGuardQuestion } from "../src/services/guardQuery.js";

const prisma = new PrismaClient();

describe("guard query parser", () => {
  beforeEach(async () => {
    await prisma.companyAlias.deleteMany();
    await prisma.visitorLog.deleteMany();
    await prisma.companyAlias.create({
      data: { alias: "蓝鲸", canonicalName: "蓝色鲸鱼科技" }
    });
  });

  it("answers today count and company count deterministically", async () => {
    const now = new Date("2026-04-23T10:00:00+08:00");
    await prisma.visitorLog.createMany({
      data: [
        {
          plateNumber: "沪A12345",
          targetCompany: "蓝色鲸鱼科技",
          phone: "13812341234",
          visitReason: "送货",
          status: "mock-sent",
          entryTime: new Date("2026-04-23T09:00:00+08:00")
        },
        {
          plateNumber: "苏B88888",
          targetCompany: "星河智能制造有限公司",
          phone: "13900001111",
          visitReason: "维修",
          status: "mock-sent",
          entryTime: new Date("2026-04-23T09:20:00+08:00")
        }
      ]
    });

    const total = await answerGuardQuestion("今天一共有多少访问车辆？", prisma, now);
    const company = await answerGuardQuestion("蓝鲸今天来了几辆车？", prisma, now);
    const busiest = await answerGuardQuestion("什么时间段访问最多？", prisma, now);

    expect(total.data.count).toBe(2);
    expect(company.data.count).toBe(1);
    expect(busiest.answer).toContain("9:00-10:00");
  });
});
