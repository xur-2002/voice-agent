import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { answerGuardQuestion } from "../src/services/guardQuery.js";

const prisma = new PrismaClient();

describe("guard query parser", () => {
  beforeEach(async () => {
    await prisma.companyAlias.deleteMany();
    await prisma.visitorLog.deleteMany();
    await prisma.companyAlias.createMany({
      data: [
        { alias: "蓝鲸", canonicalName: "蓝色鲸鱼科技" },
        { alias: "蓝色鲸鱼", canonicalName: "蓝色鲸鱼科技" }
      ]
    });
    await prisma.visitorLog.createMany({
      data: [
        {
          plateNumber: "沪A12345",
          targetCompany: "蓝色鲸鱼科技",
          phone: "13386652510",
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
        },
        {
          plateNumber: "沪A54321",
          targetCompany: "蓝色鲸鱼科技",
          phone: "13386652510",
          visitReason: "拜访",
          status: "mock-sent",
          entryTime: new Date("2026-04-21T15:30:00+08:00")
        }
      ]
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("answers the final demo guard questions deterministically", async () => {
    const now = new Date("2026-04-23T10:00:00+08:00");

    const today = await answerGuardQuestion("今天一共有多少访问车辆？", prisma, now);
    const week = await answerGuardQuestion("本周一共多少访问车辆？", prisma, now);
    const company = await answerGuardQuestion("蓝色鲸鱼今天来了几辆车？", prisma, now);
    const busiest = await answerGuardQuestion("什么时间段访问最多？", prisma, now);
    const phone = await answerGuardQuestion("这个手机号13386652510这个月来了几次？", prisma, now);

    expect(today.data.count).toBe(2);
    expect(week.data.count).toBe(3);
    expect(company.data.count).toBe(1);
    expect(busiest.data).toMatchObject({ busiest_hour: 9, count: 2 });
    expect(phone.data.count).toBe(2);
  });
});
