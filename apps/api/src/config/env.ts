import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// If run from workspace root in monorepo, load variables from apps/api/.env
const workspaceEnvPath = path.resolve(process.cwd(), 'apps/api/.env');
if (fs.existsSync(workspaceEnvPath)) {
  dotenv.config({ path: workspaceEnvPath, override: true });
}

const envSchema = z.object({
  PORT: z.string().default('4000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/make_it_do?schema=public'),
  OPENAI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  LLM_PROVIDER: z.string().default('github-models'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:', result.error.format());
  process.exit(1);
}

export const env = result.data;
