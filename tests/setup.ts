// Test environment defaults — populated only if not already set. Production
// code reads from process.env directly, so this just ensures the lib/env
// module can parse in unit tests that don't load .env.local.

const e = process.env as Record<string, string | undefined>;
e.NODE_ENV = e.NODE_ENV ?? 'test';
e.DATABASE_URL =
  e.DATABASE_URL ?? 'postgresql://lang:devpassword@localhost:5433/language_learning_test';
e.AUTH_SECRET = e.AUTH_SECRET ?? 'a'.repeat(44);
e.APP_ENCRYPTION_KEY = e.APP_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString('base64');
e.RESEND_API_KEY = e.RESEND_API_KEY ?? 're_test_key';
e.EMAIL_FROM = e.EMAIL_FROM ?? 'test@example.com';
e.APP_URL = e.APP_URL ?? 'http://localhost:3000';
e.MOCK_EMAIL = e.MOCK_EMAIL ?? '1';
