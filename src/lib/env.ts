import { z } from 'zod';

const isProd = process.env.NODE_ENV === 'production';
// `next build` sets NODE_ENV=production and imports every route module to
// collect page data, but the real secrets are not present at build time (they
// are mounted at runtime). Treat the build phase like dev — warn instead of
// throwing — so a production image can be built without baking in secrets. The
// hard fail-fast still applies at actual server startup, where NEXT_PHASE is
// unset.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

const schema = z
  .object({
    DATABASE_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    AUTH_TRUST_HOST: z
      .string()
      .optional()
      .transform((v) => v === 'true' || v === '1'),
    APP_ENCRYPTION_KEY: z.string().min(32),
    RESEND_API_KEY: z.string().startsWith('re_').or(z.literal('')).optional(),
    // Must be an address on a domain VERIFIED for the Resend key. The shared
    // `onboarding@resend.dev` sender only delivers to the Resend account owner,
    // which silently broke resets to any other inbox.
    EMAIL_FROM: z.string().min(1).default('Kaojai <noreply@mattmcdonnell.net>'),
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
    STORAGE_DRIVER: z.enum(['local', 'gcs']).default('local'),
    LOCAL_STORAGE_DIR: z.string().default('./storage'),
    GCS_BUCKET: z.string().optional(),
    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  })
  .refine(
    (v) =>
      v.STORAGE_DRIVER !== 'gcs' ||
      (!!v.GCS_BUCKET && !!v.GOOGLE_APPLICATION_CREDENTIALS),
    {
      message:
        'GCS_BUCKET and GOOGLE_APPLICATION_CREDENTIALS are required when STORAGE_DRIVER=gcs',
      path: ['STORAGE_DRIVER'],
    },
  );

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  if (isProd && !isBuildPhase) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables — refusing to start in production.');
  } else {
    console.warn('Environment validation warnings:', parsed.error.flatten().fieldErrors);
  }
}

export const env = parsed.success
  ? parsed.data
  : (process.env as unknown as z.infer<typeof schema>);
