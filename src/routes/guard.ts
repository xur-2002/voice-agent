import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { openGateForVisitor } from "../services/gate-control.js";
import { answerGuardQuestion } from "../services/guardQuery.js";

const guardQuerySchema = z.object({
  question: z.string().min(1).max(200)
});

export function registerGuardRoutes(app: FastifyInstance, prisma: PrismaClient) {
  app.get("/guard", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderGuardPage());
  });

  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    "/guard/visitors/:id/approve",
    async (request, reply) => {
      const result = await decideVisitor(request.params.id, request.query.token, "approved", prisma, request.log);
      return reply.code(result.httpStatus).type("text/html; charset=utf-8").send(result.html);
    }
  );

  app.get<{ Params: { id: string }; Querystring: { token?: string } }>(
    "/guard/visitors/:id/reject",
    async (request, reply) => {
      const result = await decideVisitor(request.params.id, request.query.token, "rejected", prisma, request.log);
      return reply.code(result.httpStatus).type("text/html; charset=utf-8").send(result.html);
    }
  );

  app.post("/guard/query", async (request, reply) => {
    const parsed = guardQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        answer: "问题不能为空。",
        data: { issues: parsed.error.issues }
      });
    }

    return reply.send(await answerGuardQuestion(parsed.data.question, prisma));
  });
}

async function decideVisitor(
  id: string,
  token: string | undefined,
  decision: "approved" | "rejected",
  prisma: PrismaClient,
  logger: Parameters<typeof openGateForVisitor>[1]
) {
  const visitor = await prisma.visitorLog.findUnique({ where: { id } });
  if (!visitor || !token || visitor.actionToken !== token) {
    return {
      httpStatus: 403,
      html: renderDecisionPage("操作无效或链接已过期。")
    };
  }

  if (visitor.status === "approved") {
    return {
      httpStatus: 200,
      html: renderDecisionPage(`已确认放行：${visitor.plateNumber}`)
    };
  }

  if (visitor.status === "rejected") {
    return {
      httpStatus: 200,
      html: renderDecisionPage(`已拒绝放行：${visitor.plateNumber}`)
    };
  }

  const now = new Date();
  const updated = await prisma.visitorLog.update({
    where: { id },
    data:
      decision === "approved"
        ? { status: "approved", approvedAt: now, decisionSource: "wecom-link" }
        : { status: "rejected", rejectedAt: now, decisionSource: "wecom-link" }
  });

  if (decision === "approved") {
    await openGateForVisitor(updated, logger);
  }

  return {
    httpStatus: 200,
    html: renderDecisionPage(
      decision === "approved" ? `已确认放行：${updated.plateNumber}` : `已拒绝放行：${updated.plateNumber}`
    )
  };
}

function renderDecisionPage(message: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>门岗操作结果</title>
  <style>
    :root { color-scheme: light; font-family: Arial, "Microsoft YaHei", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #1f2933; }
    main { width: min(92vw, 420px); background: #fff; border: 1px solid #d9dee7; border-radius: 8px; padding: 24px; text-align: center; }
    h1 { margin: 0; font-size: 22px; line-height: 1.4; }
    a { display: inline-block; margin-top: 18px; color: #2563eb; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(message)}</h1>
    <a href="/guard">返回登记页</a>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return replacements[char] ?? char;
  });
}

function renderGuardPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>园区访客登记</title>
  <style>
    :root { color-scheme: light; font-family: Arial, "Microsoft YaHei", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #1f2933; }
    main { max-width: 1080px; margin: 0 auto; padding: 28px 18px 48px; }
    h1 { margin: 0 0 18px; font-size: 24px; font-weight: 700; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    section { margin-top: 18px; }
    .panel { background: #fff; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; }
    .query { display: flex; gap: 10px; align-items: center; }
    input { flex: 1; min-width: 0; height: 40px; border: 1px solid #c7d0dd; border-radius: 6px; padding: 0 12px; font-size: 15px; }
    button { height: 40px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; padding: 0 16px; font-size: 15px; cursor: pointer; }
    button:disabled { opacity: 0.55; cursor: wait; }
    .examples { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .examples button { background: #eef2ff; color: #1e3a8a; border: 1px solid #c7d2fe; height: 32px; padding: 0 10px; font-size: 13px; }
    #answer { margin-top: 12px; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; min-height: 20px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d9dee7; border-radius: 8px; overflow: hidden; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e5e9f0; text-align: left; font-size: 14px; white-space: nowrap; }
    th { background: #f1f5f9; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    .table-wrap { overflow-x: auto; border-radius: 8px; }
    @media (max-width: 640px) {
      .query { align-items: stretch; flex-direction: column; }
      button { width: 100%; }
      th, td { font-size: 13px; }
    }
  </style>
</head>
<body>
  <main>
    <h1>园区访客登记</h1>
    <section class="panel">
      <h2>值守查询</h2>
      <div class="query">
        <input id="question" placeholder="今天一共有多少访问车辆？" />
        <button id="ask">查询</button>
      </div>
      <div class="examples">
        <button data-q="今天一共有多少访问车辆？">今天车辆数</button>
        <button data-q="本周一共多少访问车辆？">本周车辆数</button>
        <button data-q="蓝色鲸鱼科技今天来了几辆车？">公司今日车辆</button>
        <button data-q="什么时间段访问最多？">高峰时间段</button>
        <button data-q="13812341234这个手机号这个月来了几次？">手机号次数</button>
      </div>
      <div id="answer">等待查询</div>
    </section>
    <section>
      <h2>最近登记</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>入场时间</th><th>车牌</th><th>来访单位</th><th>手机号</th><th>事由</th><th>状态</th><th>处理时间</th></tr>
          </thead>
          <tbody id="visitors"></tbody>
        </table>
      </div>
    </section>
  </main>
  <script>
    const question = document.querySelector("#question");
    const ask = document.querySelector("#ask");
    const answer = document.querySelector("#answer");
    const visitors = document.querySelector("#visitors");

    document.querySelectorAll("[data-q]").forEach((button) => {
      button.addEventListener("click", () => {
        question.value = button.dataset.q;
        runQuery();
      });
    });

    ask.addEventListener("click", runQuery);
    question.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runQuery();
    });

    async function runQuery() {
      const value = question.value.trim();
      if (!value) return;
      ask.disabled = true;
      answer.textContent = "查询中...";
      try {
        const response = await fetch("/guard/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: value })
        });
        const data = await response.json();
        answer.textContent = data.answer || "没有结果";
      } catch (error) {
        answer.textContent = "查询失败，请稍后重试。";
      } finally {
        ask.disabled = false;
      }
    }

    async function loadVisitors() {
      const response = await fetch("/visitors?limit=20");
      const data = await response.json();
      visitors.innerHTML = (data.visitors || []).map((visitor) => {
        const time = new Date(visitor.entry_time).toLocaleString("zh-CN", { hour12: false });
        const decisionTime = visitor.approved_at || visitor.rejected_at;
        const decisionLabel = decisionTime ? new Date(decisionTime).toLocaleString("zh-CN", { hour12: false }) : "";
        return "<tr>" +
          "<td>" + escapeHtml(time) + "</td>" +
          "<td>" + escapeHtml(visitor.plate_number) + "</td>" +
          "<td>" + escapeHtml(visitor.target_company) + "</td>" +
          "<td>" + escapeHtml(visitor.phone) + "</td>" +
          "<td>" + escapeHtml(visitor.visit_reason) + "</td>" +
          "<td>" + escapeHtml(visitor.status) + "</td>" +
          "<td>" + escapeHtml(decisionLabel) + "</td>" +
        "</tr>";
      }).join("");
    }

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      })[char]);
    }

    loadVisitors();
  </script>
</body>
</html>`;
}
