# Render + Neon Deployment

This branch is prepared for Neon PostgreSQL in production. Do not use SQLite on Render.

## 1. Create Neon PostgreSQL

1. Create a Neon project.
2. Create or select a database.
3. Copy the pooled connection string and use it as `DATABASE_URL`.
4. Copy the direct connection string and use it as `DIRECT_URL`.
5. Keep `sslmode=require` in both URLs.

Example placeholders:

```text
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DB?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/DB?sslmode=require"
```

Do not commit real database URLs.

## 2. Create Render Web Service

1. Create a new Render Web Service from the GitHub repo.
2. Branch: `feature/voice-agent-mvp`
3. Runtime: Node.js
4. Build command:

```bash
npm install && npx prisma generate && npm run build
```

5. Start command:

```bash
npx prisma migrate deploy && npm run start
```

6. Health check path:

```text
/health
```

## 3. Render Environment Variables

Set these in Render, not in Git:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DB?sslmode=require
DIRECT_URL=postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/DB?sslmode=require
WECOM_WEBHOOK_URL=<your_wecom_group_robot_webhook>
PUBLIC_BASE_URL=https://your-render-service.onrender.com
NODE_ENV=production
PORT=10000
```

`WECOM_WEBHOOK_URL` is optional for a dry run, but WeCom delivery needs it.

## 4. Verify Deployment

Open:

```text
https://your-render-service.onrender.com/health
```

Expected:

```json
{
  "ok": true,
  "service": "voice-agent",
  "time": "..."
}
```

## 5. Update Vapi

After Render is healthy, update the Vapi tool and assistant to the Render domain:

```powershell
$env:VAPI_API_KEY="paste_private_vapi_key_here"
$env:VAPI_TOOL_ID="f478648e-5537-4b11-a5f5-6330b45c8017"
$env:VAPI_ASSISTANT_ID="7835273d-ce47-4cb4-b7e9-ad43057b0183"
$env:PUBLIC_BASE_URL="https://your-render-service.onrender.com"

npm.cmd run vapi:revert-phone-flow
```

The final demo uses explicit phone collection, so `phone` remains required in the Vapi `submitVisitor` tool.

## 6. Final Smoke Test

Call the Vapi number:

```text
AI: 您好，请说车牌、公司、事由。
User: 沪，A，一二三四五，来蓝色鲸鱼送货。
AI: 收到，手机号麻烦一位一位说一下。
User: 一三三，八六六，五二五，一零。
AI: 好的，已通知门卫。
```

Confirm:

- WeCom receives the registration.
- WeCom approve/reject links point at the Render domain.
- Approve link shows `已确认放行`.
- `/guard` shows the approved status.
