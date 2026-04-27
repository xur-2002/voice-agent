const VAPI_BASE_URL = "https://api.vapi.ai";
const DEFAULT_TOOL_ID = "f478648e-5537-4b11-a5f5-6330b45c8017";
const DEFAULT_PUBLIC_BASE_URL = "https://footwear-smooth-during-testimony.trycloudflare.com";
const ASSISTANT_NAME = "工业园区访客登记助手";
const MODEL_CANDIDATES = [
  { provider: "openai", model: "gpt-4o-mini" },
  { provider: "anthropic", model: "claude-3-5-haiku-latest" },
  { provider: "openai", model: "gpt-4.1-mini" }
];

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
- 不要像客服机器人，不要说太多客套话。
- 每次最多说两句话。
- 不要机械式一问一答。
- 第一轮尽量同时询问：车牌号、找哪家公司、什么事。
- 用户已经说过的信息不要重复追问。
- 缺什么只问什么。
- 信息齐全后，必须立刻调用 submitVisitor 工具。
- 工具调用成功后，告诉用户：“好的，已通知门卫，请稍等放行。”
- 不要询问预计停留多久，因为这不是必填项。
- 如果车牌号或手机号听不清，只确认那一个字段。
- 如果用户表达很口语化，要自动理解。例如“蓝鲸”“蓝色鲸鱼”都可以理解为目标公司。
- 如果工具返回成功，不要继续追问。

手机号采集策略：
- 询问手机号时，不要说“手机号方便留一下吗？”，而是说：“收到，手机号麻烦一位一位说一下。”
- 如果用户一次性说太快，或识别结果不是明确11位数字，只追问手机号，不要重新问车牌、公司、事由。
- 用户说完手机号后，如果可以解析出11位中国大陆手机号，立即调用 submitVisitor。
- 不要复述手机号。
- 不要问“手机号是 xxx 对吗？”。
- 不要等待用户回答“对”。
- 只有在手机号缺失、明显不是11位、或无法解析时，才只追问手机号。
- 本次稳定演示不需要先调用 validatePhone；submitVisitor 后端会做手机号归一化和校验。
- 如果平台支持按键输入，可提示：“也可以直接用手机键盘输入手机号，输完按井号键。”但当前 Vapi 是否能接收 caller DTMF 需要以实际事件日志为准。
- 不要使用 Vapi 的 DTMF sending tool 来假装收集用户按键。该工具主要用于 AI 向 IVR 发送按键音。
- 手机号可以理解中文数字，例如“一三三八六六五二五一零”应理解为“13386652510”。
- 如果手机号听起来是分组中文数字，例如“一三三，八六六，五二五，一零”，应将其作为 13386652510 提交。
- caller_number 可以作为后台备用字段传给工具，但不要作为这次演示的默认联系电话。

对话目标：
普通访客最多3轮完成。
从电话接通到提交登记应尽量控制在25秒以内。

示例对话：
助手：您好，这里是园区访客登记。麻烦说下车牌号、找哪家公司、来做什么事儿？
用户：沪A12345，来蓝色鲸鱼送货。
助手：收到，手机号麻烦一位一位说一下。
用户：一三三，八六六，五二五，一零。
助手调用 submitVisitor。
助手：好的，已通知门卫，请稍等放行。`;

const apiKey = process.env.VAPI_API_KEY;
const toolId = process.env.VAPI_TOOL_ID || DEFAULT_TOOL_ID;
const validatePhoneToolId = process.env.VALIDATE_PHONE_TOOL_ID || "";
const publicBaseUrl = stripTrailingSlash(process.env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL);
const submitVisitorUrl = `${publicBaseUrl}/tools/submit-visitor`;
const validatePhoneUrl = `${publicBaseUrl}/tools/validate-phone`;
const callEventsUrl = `${publicBaseUrl}/webhooks/call-events`;

if (!apiKey) {
  console.error("Missing VAPI_API_KEY.");
  console.error("Set it in Windows PowerShell and rerun:");
  console.error('$env:VAPI_API_KEY="paste_your_private_vapi_api_key_here"');
  console.error(`$env:VAPI_TOOL_ID="${DEFAULT_TOOL_ID}"`);
  console.error(`$env:PUBLIC_BASE_URL="${DEFAULT_PUBLIC_BASE_URL}"`);
  console.error("npm.cmd run vapi:create-assistant");
  process.exit(1);
}

async function main() {
  console.log(`Creating Vapi Assistant: ${ASSISTANT_NAME}`);
  console.log(`Existing Vapi Tool ID: ${toolId}`);
  if (validatePhoneToolId) console.log(`Optional validatePhone Tool ID: ${validatePhoneToolId}`);
  console.log(`Public submitVisitor URL: ${submitVisitorUrl}`);
  console.log(`Public validatePhone URL: ${validatePhoneUrl}`);
  console.log(`Call events webhook URL: ${callEventsUrl}`);
  console.log("Reminder: keep submitVisitor phone required for the stable explicit-phone demo.");

  await warnIfToolLookupFails(toolId);

  const result = await createAssistantWithFallbacks();
  printResult(result);
}

async function createAssistantWithFallbacks() {
  const attempts = [];

  for (const model of MODEL_CANDIDATES) {
    for (const shape of payloadShapes()) {
      const label = `${model.provider}/${model.model} ${shape.label}`;
      try {
        console.log(`Trying assistant create payload: ${label}`);
        const assistant = await vapiRequest("POST", "/assistant", shape.build(model, { attachTool: true }));
        return {
          assistant,
          model,
          toolAttached: true,
          toolAttachment: shape.toolAttachment,
          voiceConfigured: shape.includeVoice,
          transcriberConfigured: shape.includeTranscriber,
          creationPath: label
        };
      } catch (error) {
        attempts.push({ label, error });
        logRecoverableError(`Assistant create attempt failed: ${label}`, error);
      }
    }
  }

  console.warn("");
  console.warn("All assistant create attempts with tool attachment failed.");
  console.warn("Creating the Assistant without tool attachment so you can add the existing tool manually.");

  for (const model of MODEL_CANDIDATES) {
    for (const shape of payloadShapes()) {
      const label = `${model.provider}/${model.model} ${shape.label} without tool`;
      try {
        console.log(`Trying assistant create payload: ${label}`);
        const assistant = await vapiRequest("POST", "/assistant", shape.build(model, { attachTool: false }));
        return {
          assistant,
          model,
          toolAttached: false,
          toolAttachment: "manual",
          voiceConfigured: shape.includeVoice,
          transcriberConfigured: shape.includeTranscriber,
          creationPath: label,
          attempts
        };
      } catch (error) {
        attempts.push({ label, error });
        logRecoverableError(`Assistant create attempt failed: ${label}`, error);
      }
    }
  }

  const error = new Error("Could not create a Vapi Assistant with any payload fallback.");
  error.attempts = attempts;
  throw error;
}

function payloadShapes() {
  return [
    {
      label: "with model.toolIds, transcriber, voice, and server.url",
      toolAttachment: "model.toolIds",
      includeVoice: true,
      includeTranscriber: true,
      build: (model, options) =>
        assistantPayload(model, {
          ...options,
          toolAttachment: "model.toolIds",
          includeVoice: true,
          includeTranscriber: true,
          serverShape: "server.url"
        })
    },
    {
      label: "with model.toolIds, transcriber, and serverUrl; no voice",
      toolAttachment: "model.toolIds",
      includeVoice: false,
      includeTranscriber: true,
      build: (model, options) =>
        assistantPayload(model, {
          ...options,
          toolAttachment: "model.toolIds",
          includeVoice: false,
          includeTranscriber: true,
          serverShape: "serverUrl"
        })
    },
    {
      label: "with model.tools references; no voice",
      toolAttachment: "model.tools reference",
      includeVoice: false,
      includeTranscriber: true,
      build: (model, options) =>
        assistantPayload(model, {
          ...options,
          toolAttachment: "model.tools",
          includeVoice: false,
          includeTranscriber: true,
          serverShape: "server.url"
        })
    },
    {
      label: "minimal with model.toolIds; no voice or transcriber",
      toolAttachment: "model.toolIds",
      includeVoice: false,
      includeTranscriber: false,
      build: (model, options) =>
        assistantPayload(model, {
          ...options,
          toolAttachment: "model.toolIds",
          includeVoice: false,
          includeTranscriber: false,
          serverShape: "none"
        })
    }
  ];
}

function assistantPayload(
  model,
  { attachTool, toolAttachment, includeVoice, includeTranscriber, serverShape }
) {
  const payload = {
    name: ASSISTANT_NAME,
    firstMessage: FIRST_MESSAGE,
    firstMessageMode: "assistant-speaks-first",
    firstMessageInterruptionsEnabled: true,
    maxDurationSeconds: 60,
    endCallMessage: "好的，已通知门卫，请稍等放行。",
    model: {
      provider: model.provider,
      model: model.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        }
      ]
    },
    metadata: {
      app: "voice-agent",
      purpose: "industrial-park-visitor-registration",
      submitVisitorUrl,
      validatePhoneUrl
    }
  };

  if (attachTool && toolAttachment === "model.toolIds") {
    payload.model.toolIds = [toolId, validatePhoneToolId].filter(Boolean);
  }

  if (attachTool && toolAttachment === "model.tools") {
    payload.model.tools = [
      {
        id: toolId,
        type: "tool",
        name: "submitVisitor"
      },
      validatePhoneToolId
        ? {
            id: validatePhoneToolId,
            type: "tool",
            name: "validatePhone"
          }
        : undefined
    ].filter(Boolean);
  }

  if (includeTranscriber) {
    payload.transcriber = {
      provider: "deepgram",
      language: "zh"
    };
  }

  if (includeVoice) {
    payload.voice = {
      provider: "azure",
      voiceId: "zh-CN-XiaoxiaoNeural",
      speed: 1.05
    };
  }

  if (serverShape === "server.url") {
    payload.server = { url: callEventsUrl };
  } else if (serverShape === "serverUrl") {
    payload.serverUrl = callEventsUrl;
  }

  return payload;
}

async function warnIfToolLookupFails(id) {
  try {
    const tool = await vapiRequest("GET", `/tool/${id}`);
    const name = tool?.name ?? tool?.function?.name ?? "(unnamed)";
    console.log(`Existing tool found: ${name} (${tool?.type ?? "unknown type"})`);
  } catch (error) {
    console.warn("Warning: could not fetch the existing tool before creating the assistant.");
    printApiError(error);
    console.warn("Continuing anyway; assistant creation will still try to attach this tool ID.");
  }
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
  if (!response.ok) {
    throw new VapiApiError(method, path, response.status, responseBody);
  }

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
    if (typeof error.body === "string") {
      console.warn(error.body);
    } else {
      console.warn(JSON.stringify(error.body, null, 2));
    }
    if (error.status === 401 || error.status === 403) {
      console.warn("Check that you used the Private API Key, not the public key.");
    }
    return;
  }

  console.warn(error instanceof Error ? error.stack || error.message : error);
}

function printResult(result) {
  const assistant = result.assistant;
  console.log("");
  console.log("Vapi Assistant creation completed.");
  console.log(`Assistant ID: ${assistant.id ?? "(missing id)"}`);
  console.log(`Assistant name: ${assistant.name ?? ASSISTANT_NAME}`);
  console.log(`Dashboard URL: ${assistant.id ? `https://dashboard.vapi.ai/assistants/${assistant.id}` : "(unknown)"}`);
  console.log(`Model used: ${result.model.provider}/${result.model.model}`);
  console.log(`Existing Tool ID: ${toolId}`);
  console.log(`Optional validatePhone Tool ID: ${validatePhoneToolId || "(not provided)"}`);
  console.log(`Tool attached: ${result.toolAttached ? "yes" : "no"}`);
  console.log(`Tool attachment format: ${result.toolAttachment}`);
  console.log(`Voice configured: ${result.voiceConfigured ? "yes" : "no"}`);
  console.log(`Transcriber configured: ${result.transcriberConfigured ? "yes" : "no"}`);
  console.log(`Public submitVisitor URL: ${submitVisitorUrl}`);
  console.log(`Public validatePhone URL: ${validatePhoneUrl}`);
  console.log(`Call events webhook URL: ${callEventsUrl}`);
  console.log(`Creation path: ${result.creationPath}`);
  console.log("Stable demo setup: keep phone required; caller_number may stay optional but is not the main flow.");
  console.log("");
  console.log("Response summary:");
  console.log(
    JSON.stringify(
      {
        id: assistant.id,
        name: assistant.name,
        model: assistant.model
          ? {
              provider: assistant.model.provider,
              model: assistant.model.model,
              toolIds: assistant.model.toolIds,
              tools: Array.isArray(assistant.model.tools)
                ? assistant.model.tools.map((tool) => ({
                    id: tool.id,
                    name: tool.name ?? tool.function?.name,
                    type: tool.type
                  }))
                : undefined
            }
          : undefined,
        firstMessage: assistant.firstMessage,
        transcriber: assistant.transcriber,
        voice: assistant.voice,
        serverUrl: assistant.serverUrl,
        server: assistant.server
      },
      null,
      2
    )
  );

  if (!result.toolAttached) {
    console.log("");
    console.log("Manual tool attachment required:");
    console.log("Vapi Dashboard → Assistants → 工业园区访客登记助手 → Tools → Add Tool → submitVisitor → Publish");
  }

  if (!result.voiceConfigured) {
    console.log("");
    console.log("Voice was not included in the successful payload. Configure a Mandarin-compatible voice manually in the Vapi dashboard if needed.");
  }

  console.log("");
  console.log("Next manual step: bind a Vapi phone number to this assistant or test with Talk.");
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

main().catch((error) => {
  console.error("Failed to create Vapi Assistant.");
  printApiError(error);
  if (error?.attempts) {
    console.error("Attempted payloads:");
    for (const attempt of error.attempts) {
      console.error(`- ${attempt.label}`);
    }
  }
  process.exit(1);
});
