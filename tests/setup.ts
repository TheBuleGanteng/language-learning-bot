// Test environment defaults — populated only if not already set. Production
// code reads from process.env directly, so this just ensures the lib/env
// module can parse in unit tests that don't load .env.local.

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://lang:devpassword@localhost:5433/language_learning_test';
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'a'.repeat(44);
process.env.APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString('base64');
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? 're_test_key';
process.env.EMAIL_FROM = process.env.EMAIL_FROM ?? 'test@example.com';
process.env.APP_URL = process.env.APP_URL ?? 'http://localhost:3000';
process.env.MOCK_EMAIL = process.env.MOCK_EMAIL ?? '1';
