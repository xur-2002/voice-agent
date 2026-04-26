const VAPI_BASE_URL = "https://api.vapi.ai";
const DEFAULT_TOOL_ID = "f478648e-5537-4b11-a5f5-6330b45c8017";
const DEFAULT_ASSISTANT_ID = "7835273d-ce47-4cb4-b7e9-ad43057b0183";
const DEFAULT_PUBLIC_BASE_URL = "https://footwear-smooth-during-testimony.trycloudflare.com";

const FIRST_MESSAGE = "您好，这里是园区访客登记。麻烦说下车牌号、找哪家公司、来做什么事儿？";
const CALLER_NUMBER_POLICY = `来电号码优先策略：
- 如果系统提供 caller_number 或 customer.number，不要一开始就让用户口头报手机号。
- 先确认：“我看到您的来电号码尾号 XXXX，可以作为联系电话吗？”
- 如果用户说“可以、对、行、就这个”，使用该号码作为联系电话。
- 如果用户说“不行、换一个、不是这个”，再让用户一位一位说手机号。
- 如果系统没有提供来电号码，才询问手机号。
- 这样做是为了减少语音识别手机号错误，并缩短通话时间。
- 信息齐全后，立即调用 submitVisitor 工具。
- 如果 submitVisitor 成功，告诉用户：“好的，已通知门卫，请稍等放行。”`;

const apiKey = process.env.VAPI_API_KEY;
const toolId = process.env.VAPI_TOOL_ID || DEFAULT_TOOL_ID;
const assistantId = process.env.VAPI_ASSISTANT_ID || DEFAULT_ASSISTANT_ID;
const publicBaseUrl = stripTrailingSlash(process.env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL);
const submitVisitorUrl = `${publicBaseUrl}/tools/submit-visitor`;
const callEventsUrl = `${publicBaseUrl}/webhooks/call-events`;

if (!apiKey) {
  console.error("Missing VAPI_API_KEY.");
  console.error("Set it in Windows PowerShell and rerun:");
  console.error('$env:VAPI_API_KEY="PASTE_PRIVATE_VAPI_KEY_HERE"');
  console.error(`$env:VAPI_TOOL_ID="${DEFAULT_TOOL_ID}"`);
  console.error(`$env:VAPI_ASSISTANT_ID="${DEFAULT_ASSISTANT_ID}"`);
  console.error(`$env:PUBLIC_BASE_URL="${DEFAULT_PUBLIC_BASE_URL}"`);
  console.error("npm.cmd run vapi:update-caller-number");
  process.exit(1);
}

async function main() {
  console.log("Updating Vapi caller-number-first configuration.");
  console.log(`Tool ID: ${toolId}`);
  console.log(`Assistant ID: ${assistantId}`);
  console.log(`submitVisitor URL: ${submitVisitorUrl}`);
  console.log(`call events URL: ${callEventsUrl}`);
  console.log("");

  const toolResult = await updateSubmitVisitorTool();
  const assistantResult = await updateAssistant();

  console.log("");
  console.log("Update summary:");
  console.log(`Tool updated: ${toolResult.updated ? "yes" : "no"}`);
  console.log(`caller_number configured: ${toolResult.callerNumberConfigured ? "yes" : "unknown/manual check needed"}`);
  console.log(`phone optional: ${toolResult.phoneOptional ? "yes" : "unknown/manual check needed"}`);
  console.log(`Assistant prompt updated: ${assistantResult.promptUpdated ? "yes" : "no"}`);
  console.log(`Assistant webhook updated: ${assistantResult.webhookUpdated ? "yes" : "no/manual check needed"}`);
  console.log(`Tool ID attached to assistant: ${assistantResult.toolAttached ? "yes" : "no/manual check needed"}`);
  if (toolResult.manualNeeded || assistantResult.manualNeeded) {
    printManualInstructions();
  }
  console.log("");
  console.log("Phone call test script:");
  console.log("AI: 您好，这里是园区访客登记。麻烦说下车牌号、找哪家公司、来做什么事儿？");
  console.log("User: 沪，A，一二三四五，来蓝色鲸鱼送货。");
  console.log("AI: 我看到您的来电号码尾号 XXXX，可以作为联系电话吗？");
  console.log("User: 可以。");
  console.log("AI: 好的，已通知门卫，请稍等放行。");
}

async function updateSubmitVisitorTool() {
  const tool = await vapiRequest("GET", `/tool/${toolId}`);
  console.log("Fetched Vapi tool:");
  console.log(`- name: ${getToolName(tool) || "(unnamed)"}`);
  console.log(`- type: ${tool?.type ?? "(missing type)"}`);

  const attempts = buildToolPatchAttempts(tool);
  const errors = [];

  for (const attempt of attempts) {
    try {
      console.log(`Trying tool PATCH: ${attempt.label}`);
      const updated = await vapiRequest("PATCH", `/tool/${toolId}`, attempt.payload);
      console.log(`Tool PATCH accepted: ${attempt.label}`);
      return {
        updated: true,
        callerNumberConfigured: toolHasCallerNumber(updated) || toolHasCallerNumber(attempt.payload),
        phoneOptional: toolHasOptionalPhone(updated) || toolHasOptionalPhone(attempt.payload),
        manualNeeded: false
      };
    } catch (error) {
      errors.push({ label: attempt.label, error });
      logRecoverableError(`Tool PATCH failed: ${attempt.label}`, error);
    }
  }

  console.warn("Could not update the Vapi tool through the API with known payload shapes.");
  return {
    updated: false,
    callerNumberConfigured: false,
    phoneOptional: false,
    manualNeeded: true,
    errors
  };
}

async function updateAssistant() {
  const assistant = await vapiRequest("GET", `/assistant/${assistantId}`);
  console.log("");
  console.log("Fetched Vapi assistant:");
  console.log(`- name: ${assistant?.name ?? "(unnamed)"}`);
  console.log(`- id: ${assistant?.id ?? assistantId}`);

  const systemPrompt = readSystemPrompt(assistant);
  const nextPrompt = ensurePolicy(systemPrompt || defaultSystemPrompt());
  const toolIds = mergeToolIds(assistant?.model?.toolIds, toolId);

  const attempts = [
    {
      label: "firstMessage + model.messages + model.toolIds + server.url",
      payload: {
        firstMessage: FIRST_MESSAGE,
        server: { url: callEventsUrl },
        model: {
          ...pickModelPatchBase(assistant?.model),
          toolIds,
          messages: [{ role: "system", content: nextPrompt }]
        }
      }
    },
    {
      label: "firstMessage + model.messages + model.toolIds + serverUrl",
      payload: {
        firstMessage: FIRST_MESSAGE,
        serverUrl: callEventsUrl,
        model: {
          ...pickModelPatchBase(assistant?.model),
          toolIds,
          messages: [{ role: "system", content: nextPrompt }]
        }
      }
    },
    {
      label: "firstMessage + messages only",
      payload: {
        firstMessage: FIRST_MESSAGE,
        model: {
          ...pickModelPatchBase(assistant?.model),
          messages: [{ role: "system", content: nextPrompt }]
        }
      }
    }
  ];

  for (const attempt of attempts) {
    try {
      console.log(`Trying assistant PATCH: ${attempt.label}`);
      const updated = await vapiRequest("PATCH", `/assistant/${assistantId}`, attempt.payload);
      const updatedPrompt = readSystemPrompt(updated);
      console.log(`Assistant PATCH accepted: ${attempt.label}`);
      return {
        promptUpdated: Boolean(updatedPrompt?.includes("来电号码优先策略")),
        webhookUpdated: assistantHasWebhook(updated),
        toolAttached: modelHasToolId(updated?.model, toolId),
        manualNeeded: !modelHasToolId(updated?.model, toolId) || !assistantHasWebhook(updated)
      };
    } catch (error) {
      logRecoverableError(`Assistant PATCH failed: ${attempt.label}`, error);
    }
  }

  console.warn("Could not update the assistant prompt through the API with known payload shapes.");
  return {
    promptUpdated: false,
    webhookUpdated: assistantHasWebhook(assistant),
    toolAttached: modelHasToolId(assistant?.model, toolId),
    manualNeeded: true
  };
}

function buildToolPatchAttempts(tool) {
  const schema = submitVisitorParametersSchema();

  const patchedClone = stripReadOnlyFields(structuredClone(tool ?? {}));
  applyToolShapePatch(patchedClone, schema);

  return [
    {
      label: "apiRequest schema fields",
      payload: {
        url: submitVisitorUrl,
        method: "POST",
        headers: ensureContentTypeHeader(tool?.headers),
        body: schema,
        function: {
          ...(isRecord(tool?.function) ? tool.function : {}),
          name: getToolFunctionName(tool) || "api_request_tool",
          description:
            tool?.function?.description ||
            "提交访客登记信息。caller_number 由 Vapi 的 {{ customer.number }} 自动传入时，可作为默认联系电话。"
        }
      }
    },
    {
      label: "patched existing fetched shape",
      payload: patchedClone
    },
    {
      label: "body schema only",
      payload: {
        url: submitVisitorUrl,
        method: "POST",
        headers: ensureContentTypeHeader(tool?.headers),
        body: schema
      }
    }
  ];
}

function applyToolShapePatch(target, schema) {
  target.url = submitVisitorUrl;
  target.method = "POST";
  target.headers = ensureContentTypeHeader(target.headers);

  if (isRecord(target.function)) {
    target.function.name = target.function.name || "api_request_tool";
    delete target.function.parameters;
  } else {
    target.function = { name: "api_request_tool" };
  }

  if (isRecord(target.apiRequest)) {
    target.apiRequest.url = submitVisitorUrl;
    target.apiRequest.method = "POST";
    target.apiRequest.headers = ensureContentTypeHeader(target.apiRequest.headers);
    target.apiRequest.body = schema;
  }

  target.body = schema;
}

function submitVisitorParametersSchema() {
  return {
    type: "object",
    properties: {
      plate_number: { type: "string", description: "访客车牌号，例如 沪A12345" },
      target_company: { type: "string", description: "来访单位，例如 蓝色鲸鱼科技" },
      visit_reason: { type: "string", description: "来访事由，例如 送货、拜访、面试、维修、其他" },
      phone: { type: "string", description: "访客确认的联系电话，可选；若缺失则后端可使用 caller_number", default: "" },
      caller_number: {
        type: "string",
        description: "来电号码，Vapi 静态参数填写 {{ customer.number }}",
        default: "{{ customer.number }}"
      },
      raw_summary: { type: "string", description: "简短通话摘要，可选", default: "" }
    },
    required: ["plate_number", "target_company", "visit_reason"]
  };
}

function ensureContentTypeHeader(existing) {
  if (Array.isArray(existing)) {
    const withoutContentType = existing.filter((item) => {
      const key = String(item?.key ?? item?.name ?? "").toLowerCase();
      return key !== "content-type";
    });
    return [...withoutContentType, { key: "Content-Type", value: "application/json" }];
  }

  if (isRecord(existing)) {
    if (existing.type === "object" && isRecord(existing.properties)) {
      return {
        ...existing,
        properties: {
          ...existing.properties,
          "Content-Type": { type: "string", value: "application/json" }
        }
      };
    }
    return { ...existing, "Content-Type": existing["Content-Type"] ?? existing["content-type"] ?? "application/json" };
  }

  return { "Content-Type": "application/json" };
}

function stripReadOnlyFields(value) {
  if (!isRecord(value)) return value;
  for (const key of [
    "id",
    "orgId",
    "assistantId",
    "type",
    "bodyType",
    "createdAt",
    "updatedAt",
    "deletedAt",
    "createdBy",
    "updatedBy"
  ]) {
    delete value[key];
  }
  return value;
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

function logRecoverableError(message, error) {
  console.warn("");
  console.warn(message);
  printApiError(error);
}

function printApiError(error) {
  if (error instanceof VapiApiError) {
    console.warn(error.message);
    if (typeof error.body === "string") console.warn(error.body);
    else console.warn(JSON.stringify(error.body, null, 2));
    if (error.status === 401 || error.status === 403) {
      console.warn("Check that you used the Private API Key, not the public key.");
    }
    return;
  }
  console.warn(error instanceof Error ? error.stack || error.message : error);
}

function printManualInstructions() {
  console.log("");
  console.log("Manual fallback:");
  console.log("Vapi Dashboard → Tools → submitVisitor → Request Body / Static Parameters:");
  console.log("- Add caller_number = {{ customer.number }}");
  console.log("- Make phone optional");
  console.log("- Keep plate_number, target_company, visit_reason required");
  console.log("- Save");
  console.log("");
  console.log("Vapi Dashboard → Assistants → 工业园区访客登记助手 → Model/System Prompt:");
  console.log("- Paste the 来电号码优先策略 block");
  console.log(`- Set server/webhook URL to ${callEventsUrl}`);
  console.log("- Confirm submitVisitor is still attached");
  console.log("- Publish");
}

function getToolName(tool) {
  return tool?.name ?? tool?.function?.name ?? tool?.function?.parameters?.title ?? "";
}

function getToolFunctionName(tool) {
  return tool?.function?.name ?? "";
}

function readSystemPrompt(assistant) {
  const messages = assistant?.model?.messages;
  if (!Array.isArray(messages)) return "";
  return messages.find((message) => message?.role === "system")?.content ?? "";
}

function ensurePolicy(prompt) {
  if (prompt.includes("来电号码优先策略")) return prompt;
  return `${prompt.trim()}\n\n${CALLER_NUMBER_POLICY}`;
}

function defaultSystemPrompt() {
  return `你是工业园区停车场入口的真人门卫式语音助手。你的任务是在最短时间内完成访客车辆登记，并通知门卫。

必须采集：车牌号、来访单位、来访事由、联系电话。信息齐全后立即调用 submitVisitor 工具。`;
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

function assistantHasWebhook(assistant) {
  return assistant?.server?.url === callEventsUrl || assistant?.serverUrl === callEventsUrl;
}

function toolHasCallerNumber(tool) {
  return JSON.stringify(tool).includes("caller_number") && JSON.stringify(tool).includes("customer.number");
}

function toolHasOptionalPhone(tool) {
  const required = tool?.body?.required;
  return Array.isArray(required) && required.includes("plate_number") && required.includes("target_company") && required.includes("visit_reason") && !required.includes("phone");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

main().catch((error) => {
  console.error("Failed to update Vapi caller-number configuration.");
  printApiError(error);
  printManualInstructions();
  process.exit(1);
});
