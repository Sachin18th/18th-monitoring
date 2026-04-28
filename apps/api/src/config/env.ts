import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from the root of the api app
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.string().default('4000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  DATABASE_URL: z.string().optional(), // Optional for now since we use in-memory mostly
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  ENABLE_OUTBOUND_NOTIFICATIONS: z.string().default('false'),
  ENABLE_DEMO_SEEDING: z.string().default('true').transform(v => v === 'true'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
