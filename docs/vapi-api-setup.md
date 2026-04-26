# Vapi API Setup

The final demo uses explicit digit-by-digit phone collection. The backend still accepts `caller_number` as a fallback, but the active Vapi tool should require `phone` for a stable and predictable call flow.

## Environment

Do not commit `VAPI_API_KEY`.

```powershell
cd C:\Users\徐大帅\voice-agent

$env:VAPI_API_KEY="paste_your_private_vapi_api_key_here"
$env:VAPI_TOOL_ID="f478648e-5537-4b11-a5f5-6330b45c8017"
$env:VAPI_ASSISTANT_ID="7835273d-ce47-4cb4-b7e9-ad43057b0183"
$env:PUBLIC_BASE_URL="https://your-current-tunnel.trycloudflare.com"
```

## Stable Phone Demo Flow

Run this whenever the tunnel URL changes or after experimenting with caller-number-first behavior:

```powershell
npm.cmd run vapi:revert-phone-flow
```

The script patches:

- `submitVisitor` URL to `PUBLIC_BASE_URL + "/tools/submit-visitor"`
- method `POST`
- `Content-Type: application/json`
- required fields: `plate_number`, `target_company`, `visit_reason`, `phone`
- optional fields: `caller_number`, `raw_summary`
- Assistant first message and explicit phone collection prompt
- Assistant server/webhook URL to `PUBLIC_BASE_URL + "/webhooks/call-events"`
- existing `submitVisitor` tool attachment

## Prompt

Use [voice-agent-prompt.md](voice-agent-prompt.md). The important line is:

```text
收到，手机号麻烦一位一位说一下。
```

The assistant must repeat the normalized phone before calling `submitVisitor`:

```text
我确认一下，手机号是 13386652510，对吗？
```

## Optional Tools

`validatePhone` can be created as an API Request tool for phone normalization:

- URL: `PUBLIC_BASE_URL + "/tools/validate-phone"`
- Method: `POST`
- Body:

```json
{
  "phone": "string",
  "call_id": "string optional"
}
```

`lookupReturningVisitor` is available as a bonus endpoint:

- URL: `PUBLIC_BASE_URL + "/tools/lookup-returning-visitor"`
- Method: `POST`
- Body can include `caller_number`, `phone`, or `plate_number`.

## Caller Number Fallback

The backend can use `caller_number` when `phone` is missing or invalid, but that is not the active final demo flow. If you want to test it later, `npm.cmd run vapi:update-caller-number` restores caller-number-first behavior.

## Manual Dashboard Fallback

If the API patch is rejected:

1. Vapi Dashboard → Tools → `submitVisitor`.
2. Set URL to `PUBLIC_BASE_URL + "/tools/submit-visitor"`.
3. Set method to `POST`.
4. Make `plate_number`, `target_company`, `visit_reason`, and `phone` required.
5. Keep `caller_number` and `raw_summary` optional.
6. Vapi Dashboard → Assistants → `工业园区访客登记助手`.
7. Paste the explicit phone collection prompt.
8. Confirm `submitVisitor` is attached.
9. Set server/webhook URL to `PUBLIC_BASE_URL + "/webhooks/call-events"`.
10. Publish.

## Test Call

```text
AI: 您好，这里是园区访客登记。麻烦说下车牌号、找哪家公司、来做什么事儿？
User: 沪，A，一二三四五，来蓝色鲸鱼送货。
AI: 收到，手机号麻烦一位一位说一下。
User: 一三三，八六六，五二五，一零。
AI: 我确认一下，手机号是 13386652510，对吗？
User: 对。
AI: 好的，已通知门卫，请稍等放行。
```
