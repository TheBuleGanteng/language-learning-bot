import { z } from 'zod';

const isProd = process.env.NODE_ENV === 'production';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_TRUST_HOST: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  APP_ENCRYPTION_KEY: z.string().min(32),
  RESEND_API_KEY: z.string().startsWith('re_').or(z.literal('')).optional(),
  EMAIL_FROM: z.string().min(1).default('Language Learning Bot <onboarding@resend.dev>'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_BASE_PATH: z.string().default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MOCK_EMAIL: z
    .string()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  if (isProd) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables — refusing to start in production.');
  } else {
    console.warn('Environment validation warnings:', parsed.error.flatten().fieldErrors);
  }
}

export const env = parsed.success
  ? parsed.data
  : (process.env as unknown as z.infer<typeof schema>);
