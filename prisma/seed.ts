import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const aliases = [
  ["蓝色鲸鱼", "蓝色鲸鱼科技"],
  ["蓝鲸", "蓝色鲸鱼科技"],
  ["蓝鲸科技", "蓝色鲸鱼科技"],
  ["星河智能", "星河智能制造有限公司"],
  ["星河", "星河智能制造有限公司"]
] as const;

async function main() {
  for (const [alias, canonicalName] of aliases) {
    await prisma.companyAlias.upsert({
      where: { alias },
      update: { canonicalName },
      create: { alias, canonicalName }
    });
  }

  const seededVisitors = [
    {
      plateNumber: "沪A12345",
      targetCompany: "蓝色鲸鱼科技",
      phone: "13812341234",
      visitReason: "送货",
      callerNumber: "+13145550000",
      callId: "seed-call-001",
      rawSummary: "测试回访用户，来蓝色鲸鱼科技送货。",
      status: "mock-sent",
      wecomSentAt: new Date()
    },
    {
      plateNumber: "苏B88888",
      targetCompany: "星河智能制造有限公司",
      phone: "13900001111",
      visitReason: "维修",
      callerNumber: "+13145550001",
      callId: "seed-call-002",
      rawSummary: "测试访客，来星河智能维修设备。",
      status: "mock-sent",
      wecomSentAt: new Date()
    }
  ];

  for (const visitor of seededVisitors) {
    await prisma.visitorLog.upsert({
      where: { callId: visitor.callId },
      update: visitor,
      create: visitor
    });

    const profile = await prisma.visitorProfile.findFirst({
      where: {
        OR: [
          { phone: visitor.phone },
          { callerNumber: visitor.callerNumber },
          { plateNumber: visitor.plateNumber }
        ]
      }
    });

    if (profile) {
      await prisma.visitorProfile.update({
        where: { id: profile.id },
        data: {
          phone: visitor.phone,
          callerNumber: visitor.callerNumber,
          plateNumber: visitor.plateNumber,
          targetCompany: visitor.targetCompany,
          visitReason: visitor.visitReason,
          lastVisitAt: new Date(),
          visitCount: { increment: 1 }
        }
      });
    } else {
      await prisma.visitorProfile.create({
        data: {
          phone: visitor.phone,
          callerNumber: visitor.callerNumber,
          plateNumber: visitor.plateNumber,
          targetCompany: visitor.targetCompany,
          visitReason: visitor.visitReason,
          lastVisitAt: new Date(),
          visitCount: 1
        }
      });
    }
  }

  console.log(`Seeded ${aliases.length} company aliases and ${seededVisitors.length} visitor logs.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
