const VAPI_BASE_URL = "https://api.vapi.ai";

const apiKey = process.env.VAPI_API_KEY;

if (!apiKey) {
  console.error("Missing VAPI_API_KEY. Set it first, for example:");
  console.error('$env:VAPI_API_KEY="paste_your_private_vapi_api_key_here"');
  console.error("npm.cmd run vapi:list-tools");
  process.exit(1);
}

async function main() {
  const tools = await vapiRequest("/tool");
  const list = Array.isArray(tools) ? tools : tools?.data ?? tools?.items ?? [];

  if (!Array.isArray(list)) {
    console.log("Unexpected Vapi /tool response:");
    console.dir(tools, { depth: null });
    return;
  }

  if (list.length === 0) {
    console.log("No Vapi tools found for this API key.");
    return;
  }

  for (const tool of list) {
    const name = getToolName(tool);
    console.log([
      `id: ${tool.id ?? "(missing id)"}`,
      `type: ${tool.type ?? "(missing type)"}`,
      `name: ${name || "(unnamed)"}`
    ].join("\n"));
    console.log("---");
  }
}

async function vapiRequest(path) {
  const response = await fetch(`${VAPI_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  const body = await readResponseBody(response);
  if (!response.ok) {
    printApiError("GET", path, response.status, body);
    process.exit(1);
  }

  return body;
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

function printApiError(method, path, status, body) {
  console.error(`Vapi API error: ${method} ${path} -> HTTP ${status}`);
  if (typeof body === "string") {
    console.error(body);
  } else {
    console.error(JSON.stringify(body, null, 2));
  }
  if (status === 401 || status === 403) {
    console.error("Check that you used the Private API Key, not the public key.");
  }
}

function getToolName(tool) {
  return tool?.name ?? tool?.function?.name ?? tool?.function?.parameters?.title ?? "";
}

main().catch((error) => {
  console.error("Failed to list Vapi tools:");
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
