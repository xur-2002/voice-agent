const VAPI_BASE_URL = "https://api.vapi.ai";
const DEFAULT_TOOL_ID = "f478648e-5537-4b11-a5f5-6330b45c8017";
const DEFAULT_ASSISTANT_ID = "7835273d-ce47-4cb4-b7e9-ad43057b0183";

const FIRST_MESSAGE = "您好，这里是园区访客登记。麻烦说下车牌号、找哪家公司、来做什么事儿？";
const SYSTEM_PROMPT = `你是工业园区停车场入口的真人门卫式语音助手。你的任务是在最短时间内完成访客车辆登记，并通知门卫。

必须采集以下4项信息：
1. 车牌号
2. 来访单位
3. 手机号
4. 来访事由

说话风格：
- 只说中文普通话。
- 像真人门卫一样，简洁、自然、直接。
- 每次最多说两句话。
- 不要机械式一问一答。
- 第一轮同时询问：车牌号、找哪家公司、什么事。
- 用户已经说过的信息不要重复追问。
- 不要询问预计停留多久，因为这不是必填项。
- 不要编造手机号、车牌号或公司名。

手机号采集规则：
- 这版稳定演示必须显式采集手机号。
- 询问手机号时，说：“收到，手机号麻烦一位一位说一下。”
- 用户说手机号后，先确认格式。如果识别到 11 位手机号，慢速复述：“我确认一下，手机号是 13386652510，对吗？”
- 用户确认“对、是、可以、没错”之后，立即调用 submitVisitor。
- 如果用户说“不对、错了、不是”，只重新询问手机号。
- 如果手机号不是明确的 11 位数字，只追问手机号，不要重新问车牌、公司、事由。
- 手机号可以理解中文数字，例如“一三三八六六五二五一零”应理解为“13386652510”。

工具使用规则：
- 当已经获得 plate_number、target_company、phone、visit_reason 四个字段后，立即调用 submitVisitor。
- phone 必须来自用户明确提供并确认的手机号。
- caller_number 可以作为后台备用字段传给工具，但不要作为这次演示的默认联系电话。
- submitVisitor 工具调用成功后，告诉用户：“好的，已通知门卫，请稍等放行。”

目标：
- 普通访客最多3轮完成。
- 从电话接通到提交登记尽量控制在25秒以内。

示例：
助手：您好，这里是园区访客登记。麻烦说下车牌号、找哪家公司、来做什么事儿？
用户：沪，A，一二三四五，来蓝色鲸鱼送货。
助手：收到，手机号麻烦一位一位说一下。
用户：一三三，八六六，五二五，一零。
助手：我确认一下，手机号是 13386652510，对吗？
用户：对。
助手调用 submitVisitor。
助手：好的，已通知门卫，请稍等放行。`;

const apiKey = process.env.VAPI_API_KEY;
const toolId = process.env.VAPI_TOOL_ID || DEFAULT_TOOL_ID;
const assistantId = process.env.VAPI_ASSISTANT_ID || DEFAULT_ASSISTANT_ID;
const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");

if (!apiKey || !publicBaseUrl) {
  console.error("Missing required environment variables.");
  if (!apiKey) console.error("- VAPI_API_KEY is required.");
  if (!publicBaseUrl) console.error("- PUBLIC_BASE_URL is required.");
  console.error("");
  console.error("Set them in Windows PowerShell and rerun:");
  console.error('$env:VAPI_API_KEY="PASTE_PRIVATE_VAPI_KEY"');
  console.error(`$env:VAPI_TOOL_ID="${DEFAULT_TOOL_ID}"`);
  console.error(`$env:VAPI_ASSISTANT_ID="${DEFAULT_ASSISTANT_ID}"`);
  console.error('$env:PUBLIC_BASE_URL="CURRENT_PUBLIC_URL"');
  console.error("npm.cmd run vapi:revert-phone-flow");
  process.exit(1);
}

const submitVisitorUrl = `${publicBaseUrl}/tools/submit-visitor`;
const callEventsUrl = `${publicBaseUrl}/webhooks/call-events`;

async function main() {
  console.log("Reverting Vapi to explicit phone collection flow.");
  console.log(`Tool ID: ${toolId}`);
  console.log(`Assistant ID: ${assistantId}`);
  console.log(`submitVisitor URL: ${submitVisitorUrl}`);
  console.log(`call events URL: ${callEventsUrl}`);

  await patchTool();
  await patchAssistant();
  const verification = await verify();

  console.log("");
  console.log("Verification summary:");
  console.log(`Tool URL updated: ${verification.toolUrlUpdated ? "yes" : "no"}`);
  console.log(`Tool method POST: ${verification.toolMethodPost ? "yes" : "no"}`);
  console.log(`Content-Type JSON: ${verification.contentTypeJson ? "yes" : "no"}`);
  console.log(`Phone required: ${verification.phoneRequired ? "yes" : "no"}`);
  console.log(`Required fields stable: ${verification.requiredFieldsStable ? "yes" : "no"}`);
  console.log(`Assistant webhook updated: ${verification.webhookUpdated ? "yes" : "no"}`);
  console.log(`Explicit phone prompt active: ${verification.explicitPromptActive ? "yes" : "no"}`);
  console.log(`Caller-number-first prompt removed: ${verification.callerFirstRemoved ? "yes" : "no"}`);
  console.log(`submitVisitor tool attached: ${verification.toolAttached ? "yes" : "no"}`);

  if (!Object.values(verification).every(Boolean)) {
    console.log("");
    console.log("Manual fallback:");
    console.log("Vapi Dashboard → Tools → submitVisitor:");
    console.log("- URL: " + submitVisitorUrl);
    console.log("- Method: POST");
    console.log("- Required fields: plate_number, target_company, visit_reason, phone");
    console.log("- Optional fields: caller_number, raw_summary");
    console.log("- Save/Publish");
    console.log("");
    console.log("Vapi Dashboard → Assistants → 工业园区访客登记助手:");
    console.log("- Paste the explicit phone collection system prompt");
    console.log("- Set server/webhook URL to " + callEventsUrl);
    console.log("- Confirm submitVisitor is attached");
    console.log("- Publish");
  }
}

async function patchTool() {
  const tool = await vapiRequest("GET", `/tool/${toolId}`);
  console.log(`Fetched tool: ${tool?.name ?? "(unnamed)"} (${tool?.type ?? "unknown"})`);

  const payload = {
    url: submitVisitorUrl,
    method: "POST",
    headers: ensureContentTypeHeader(tool?.headers),
    body: submitVisitorSchema(),
    function: {
      ...(isRecord(tool?.function) ? tool.function : {}),
      name: tool?.function?.name || "api_request_tool",
      description:
        "当访客已经提供车牌号、来访单位、手机号和来访事由后，立即调用这个工具提交访客登记信息，并通知门卫。"
    }
  };

  await vapiRequest("PATCH", `/tool/${toolId}`, payload);
  console.log("Tool PATCH accepted.");
}

async function patchAssistant() {
  const assistant = await vapiRequest("GET", `/assistant/${assistantId}`);
  console.log(`Fetched assistant: ${assistant?.name ?? "(unnamed)"}`);

  const toolIds = mergeToolIds(assistant?.model?.toolIds, toolId);
  const modelBase = pickModelPatchBase(assistant?.model);
  const attempts = [
    {
      label: "server.url",
      payload: {
        firstMessage: FIRST_MESSAGE,
        server: { url: callEventsUrl },
        model: {
          ...modelBase,
          toolIds,
          messages: [{ role: "system", content: SYSTEM_PROMPT }]
        }
      }
    },
    {
      label: "serverUrl",
      payload: {
        firstMessage: FIRST_MESSAGE,
        serverUrl: callEventsUrl,
        model: {
          ...modelBase,
          toolIds,
          messages: [{ role: "system", content: SYSTEM_PROMPT }]
        }
      }
    }
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      await vapiRequest("PATCH", `/assistant/${assistantId}`, attempt.payload);
      console.log(`Assistant PATCH accepted with ${attempt.label}.`);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`Assistant PATCH failed with ${attempt.label}.`);
      printApiError(error);
    }
  }
  throw lastError;
}

async function verify() {
  const [tool, assistant] = await Promise.all([
    vapiRequest("GET", `/tool/${toolId}`),
    vapiRequest("GET", `/assistant/${assistantId}`)
  ]);
  const required = Array.isArray(tool?.body?.required) ? tool.body.required : [];
  const prompt = readSystemPrompt(assistant);
  const requiredFields = ["plate_number", "target_company", "visit_reason", "phone"];

  return {
    toolUrlUpdated: tool?.url === submitVisitorUrl,
    toolMethodPost: tool?.method === "POST",
    contentTypeJson: tool?.headers?.properties?.["Content-Type"]?.value === "application/json",
    phoneRequired: required.includes("phone"),
    requiredFieldsStable:
      required.length === requiredFields.length && requiredFields.every((field) => required.includes(field)),
    webhookUpdated: assistant?.server?.url === callEventsUrl || assistant?.serverUrl === callEventsUrl,
    explicitPromptActive: prompt.includes("手机号麻烦一位一位说一下") && prompt.includes("phone 必须来自用户明确提供"),
    callerFirstRemoved: !prompt.includes("来电号码优先策略"),
    toolAttached: modelHasToolId(assistant?.model, toolId)
  };
}

function submitVisitorSchema() {
  return {
    type: "object",
    required: ["plate_number", "target_company", "visit_reason", "phone"],
    properties: {
      plate_number: { type: "string", description: "访客车牌号，例如 沪A12345", default: "" },
      target_company: { type: "string", description: "来访单位，例如 蓝色鲸鱼科技", default: "" },
      visit_reason: { type: "string", description: "来访事由，例如 送货、拜访、面试、维修、其他", default: "" },
      phone: { type: "string", description: "访客确认后的手机号，例如 13386652510", default: "" },
      caller_number: { type: "string", description: "平台传入的来电号码，可选备用字段", default: "" },
      raw_summary: { type: "string", description: "简短通话摘要，可选", default: "" }
    }
  };
}

function ensureContentTypeHeader(existing) {
  if (isRecord(existing) && existing.type === "object" && isRecord(existing.properties)) {
    return {
      ...existing,
      properties: {
        ...existing.properties,
        "Content-Type": { type: "string", value: "application/json" }
      }
    };
  }
  return {
    type: "object",
    properties: {
      "Content-Type": { type: "string", value: "application/json" }
    }
  };
}

async function vapiRequest(method, path, body) {
  const response = await fetch(`${VAPI_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const responseBody = await readResponseBody(response);
  if (!response.ok) throw new VapiApiError(method, path, response.status, responseBody);
  return responseBody;
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

class VapiApiError extends Error {
  constructor(method, path, status, body) {
    super(`Vapi API error: ${method} ${path} -> HTTP ${status}`);
    this.method = method;
    this.path = path;
    this.status = status;
    this.body = body;
  }
}

function printApiError(error) {
  if (error instanceof VapiApiError) {
    console.warn(error.message);
    console.warn(typeof error.body === "string" ? error.body : JSON.stringify(error.body, null, 2));
    if (error.status === 401 || error.status === 403) {
      console.warn("Check that you used the Vapi Private API Key, not the public key.");
    }
    return;
  }
  console.warn(error instanceof Error ? error.stack || error.message : error);
}

function readSystemPrompt(assistant) {
  const messages = assistant?.model?.messages;
  if (!Array.isArray(messages)) return "";
  return messages.find((message) => message?.role === "system")?.content ?? "";
}

function pickModelPatchBase(model) {
  if (!isRecord(model)) return {};
  const base = {};
  for (const key of ["provider", "model", "temperature", "maxTokens"]) {
    if (model[key] !== undefined) base[key] = model[key];
  }
  return base;
}

function mergeToolIds(existing, id) {
  const values = Array.isArray(existing) ? existing.filter((value) => typeof value === "string") : [];
  return [...new Set([...values, id])];
}

function modelHasToolId(model, id) {
  if (Array.isArray(model?.toolIds) && model.toolIds.includes(id)) return true;
  if (Array.isArray(model?.tools) && model.tools.some((tool) => tool?.id === id || tool?.toolId === id)) return true;
  return false;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

main().catch((error) => {
  console.error("Failed to revert Vapi phone flow.");
  printApiError(error);
  process.exit(1);
});
