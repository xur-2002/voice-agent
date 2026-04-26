# Deployment Notes

The cloud-ready branch uses PostgreSQL as the main Prisma provider. Use Neon for Render/Railway/Fly deployments. SQLite is only used by the test schema.

## Local With Neon

```powershell
npm.cmd install
copy .env.example .env
npx.cmd prisma generate
npx.cmd prisma migrate dev
npm.cmd run seed
npm.cmd run dev
```

Set `DATABASE_URL` and `DIRECT_URL` to Neon connection strings in `.env`.

## Render

Use [render-neon-deployment.md](render-neon-deployment.md).

Short version:

```text
Build command: npm install && npx prisma generate && npm run build
Start command: npx prisma migrate deploy && npm run start
Health check: /health
```

Required env vars:

- `DATABASE_URL`
- `DIRECT_URL`
- `WECOM_WEBHOOK_URL`
- `PUBLIC_BASE_URL`
- `NODE_ENV=production`
- `PORT=10000`

## Railway

Use the same Neon variables and commands:

```bash
npm install && npx prisma generate && npm run build
npx prisma migrate deploy && npm run start
```

## Fly.io

Use the included `Dockerfile`. Set secrets with:

```bash
fly secrets set DATABASE_URL="..." DIRECT_URL="..." WECOM_WEBHOOK_URL="..." PUBLIC_BASE_URL="..."
```

Run `npx prisma migrate deploy` as a release command or one-off machine command.

## Voice Platform URLs

```text
PUBLIC_BASE_URL/tools/submit-visitor
PUBLIC_BASE_URL/tools/validate-phone
PUBLIC_BASE_URL/tools/lookup-returning-visitor
PUBLIC_BASE_URL/webhooks/call-events
```

After deployment, run:

```powershell
$env:PUBLIC_BASE_URL="https://your-render-service.onrender.com"
npm.cmd run vapi:revert-phone-flow
```

## WeCom Group Robot

1. In Enterprise WeChat, add a group robot.
2. Copy the webhook URL.
3. Set `WECOM_WEBHOOK_URL` in the deployment environment.
4. Do not commit the webhook URL.

If the webhook is empty in local development, the backend returns success with `mock-sent` and writes the visitor log.
