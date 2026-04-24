# Vapi API Assistant Setup

The Vapi dashboard Assistant editor may currently fail with:

```text
ReferenceError: blockingCount is not defined
```

Use these scripts to create the assistant through the Vapi REST API instead of the broken editor.

## Before You Run

Keep both local services running:

- Backend: `npm.cmd run dev`
- Cloudflare Tunnel pointed at the backend port

The current public backend URL is:

```text
https://footwear-smooth-during-testimony.trycloudflare.com
```

## Windows PowerShell

```powershell
cd C:\Users\徐大师\voice-agent

$env:VAPI_API_KEY="paste_your_private_vapi_api_key_here"
$env:VAPI_TOOL_ID="f478648e-5537-4b11-a5f5-6330b45c8017"
$env:PUBLIC_BASE_URL="https://footwear-smooth-during-testimony.trycloudflare.com"

npm.cmd run vapi:list-tools
npm.cmd run vapi:create-assistant
```

Do not put `VAPI_API_KEY` in a committed `.env` file or commit it to GitHub.

## List Tools

Run:

```powershell
npm.cmd run vapi:list-tools
```

Confirm the output includes the existing `submitVisitor` tool and this ID:

```text
f478648e-5537-4b11-a5f5-6330b45c8017
```

If you get `401` or `403`, check that you used the Vapi Private API Key, not the public key.

## Create Assistant

Run:

```powershell
npm.cmd run vapi:create-assistant
```

The script creates:

- Assistant name: `工业园区访客登记助手`
- Chinese first message
- Chinese visitor registration system prompt
- Existing Vapi Tool ID attached through the assistant model configuration when accepted by Vapi
- Call events webhook pointing to `PUBLIC_BASE_URL + "/webhooks/call-events"` when accepted by Vapi

The script tries low-latency model configs in this order:

1. `openai` / `gpt-4o-mini`
2. `anthropic` / `claude-3-5-haiku-latest`
3. `openai` / `gpt-4.1-mini`

If voice or transcriber settings are rejected by the Vapi API, the script retries with smaller payloads and prints what must be configured manually.

If tool attachment is rejected, the assistant is still created and the script prints this manual step:

```text
Vapi Dashboard → Assistants → 工业园区访客登记助手 → Tools → Add Tool → submitVisitor → Publish
```

## Bind Phone Number

After the assistant is created:

1. Open Vapi Dashboard.
2. Go to Phone Numbers.
3. Select the phone number.
4. Bind it to `工业园区访客登记助手`.
5. Save or publish the phone number configuration.

## Test Call

Call the Vapi number and test this flow:

```text
沪A12345，来蓝色鲸鱼送货。
13812341234。
```

Expected result:

- The assistant calls `submitVisitor`.
- The backend receives `POST /tools/submit-visitor`.
- WeCom receives the markdown notification, or local mock mode succeeds if `WECOM_WEBHOOK_URL` is empty.
