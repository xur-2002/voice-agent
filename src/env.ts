import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional().default(""),
  WECOM_WEBHOOK_URL: z.string().optional().default(""),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  VOICE_PROVIDER: z.string().default("vapi"),
  WEBHOOK_SECRET: z.string().optional().default(""),
  NODE_ENV: z.string().default("development")
});

export const env = envSchema.parse(process.env);
