# Deployment Notes

## Local

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev
npm run seed
npm run dev
```

Local SQLite lives at `prisma/dev.db`.

## Render or Railway

1. Create a Node.js 20 service.
2. Set build command:
   ```bash
   npm ci && npx prisma generate && npm run build
   ```
3. Set start command:
   ```bash
   npm run start
   ```
4. Configure environment variables:
   - `PORT`
   - `DATABASE_URL`
   - `WECOM_WEBHOOK_URL`
   - `PUBLIC_BASE_URL`
   - `NODE_ENV=production`
5. Run migrations during release/deploy:
   ```bash
   npx prisma migrate deploy
   ```

The default Prisma schema is SQLite for local acceptance. For Neon/PostgreSQL, change `provider = "sqlite"` to `provider = "postgresql"` in `prisma/schema.prisma`, set a PostgreSQL `DATABASE_URL`, and create a production migration before deploying.

## Fly.io

Use the included `Dockerfile`. Set secrets with:

```bash
fly secrets set DATABASE_URL="..." WECOM_WEBHOOK_URL="..." PUBLIC_BASE_URL="..."
```

Run `npx prisma migrate deploy` as a release command or one-off machine command.

## Vercel or Cloudflare Workers

This Fastify server is easiest on Render/Railway/Fly. For Vercel or Workers, keep the service logic and adapt the HTTP entrypoint to the platform runtime. Also use a hosted PostgreSQL database because local SQLite is not durable on serverless filesystems.

## Voice Platform URLs

Vapi server/tool URLs:

```text
PUBLIC_BASE_URL/tools/submit-visitor
PUBLIC_BASE_URL/tools/lookup-returning-visitor
```

Retell custom function endpoints:

```text
PUBLIC_BASE_URL/tools/submit-visitor
PUBLIC_BASE_URL/tools/lookup-returning-visitor
```

Inbound call events webhook:

```text
PUBLIC_BASE_URL/webhooks/call-events
```

## WeCom Group Robot

1. In Enterprise WeChat, add a group robot.
2. Copy the webhook URL.
3. Set `WECOM_WEBHOOK_URL` in the deployment environment.
4. Do not commit the webhook URL.

If the webhook is empty in local development, the backend returns success with `mock-sent` and writes the visitor log.
