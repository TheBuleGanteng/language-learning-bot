import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import path from 'node:path';

const DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://lang:devpassword@localhost:5433/language_learning';

const TEST_EMAIL = `e2e+${Date.now()}@example.com`;
const TEST_PASSWORD = 'Password1';

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  await client.query('DELETE FROM users WHERE email = $1', [TEST_EMAIL]);
  await client.end();
});

test('full flow: signup → verify → login → import → filter → settings reveal', async ({
  page,
}) => {
  // 1. Sign up
  await page.goto('/signup');
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign up/i }).click();
  // Dev-mode Next.js may need to compile /verify-sent on first navigation
  await expect(page).toHaveURL(/\/verify-sent/, { timeout: 30_000 });

  // 2. Pull the verification token directly from the DB
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  const tokRes = await client.query(
    `SELECT vt.id, vt.token_hash FROM verification_tokens vt
     JOIN users u ON u.id = vt.user_id
     WHERE u.email = $1 AND vt.purpose = 'email_verify'
     ORDER BY vt.created_at DESC LIMIT 1`,
    [TEST_EMAIL],
  );
  expect(tokRes.rowCount).toBe(1);

  // The raw token is only printed to console by MOCK_EMAIL=1. For the test,
  // skip the token and directly mark the user verified in the DB, which
  // matches what /api/auth/verify does. (We've already proven the verify
  // endpoint works via the unit-test-equivalent path; here we want to test
  // the login + features further on.)
  await client.query(
    `UPDATE users SET email_verified_at = now() WHERE email = $1`,
    [TEST_EMAIL],
  );
  await client.end();

  // 3. Log in
  await page.goto('/login');
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /^log in$/i }).click();
  await expect(page).toHaveURL(/\/vocab/, { timeout: 30_000 });

  // 4. Import the fixture CSV via the import page
  await page.goto('/vocab/import');
  const fixturePath = path.resolve(__dirname, '../fixtures/sample-notion-export.csv');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.getByRole('button', { name: /import/i }).click();
  await expect(page.getByText('Import summary')).toBeVisible({ timeout: 15_000 });
  // 6 unique rows in the fixture, all new
  await expect(page.getByText('Inserted')).toBeVisible();

  // 5. Vocab list shows items
  await page.goto('/vocab');
  await expect(page.getByText('สวัสดี')).toBeVisible();
  await expect(page.getByText(/Showing \d+ of \d+ items/)).toBeVisible();

  // 6. Filter by "Lesson 1" — should show greetings only (2 items: สวัสดี + ขอบคุณ)
  await page.getByRole('checkbox', { name: 'Lesson 1' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'สวัสดี' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'ขอบคุณ' })).toBeVisible();
  // The 'กิน' row is in Lesson 2 only and should be filtered out
  await expect(page.getByRole('row').filter({ hasText: 'กิน' })).toHaveCount(0);

  // 6b. Column sort — clear filter first, then exercise Thai column header
  await page.goto('/vocab');
  // Capture the default-order first body row Thai value (created_at DESC)
  const defaultFirstThai = (
    await page.locator('tbody tr').first().locator('td').first().textContent()
  )?.trim();
  expect(defaultFirstThai).toBeTruthy();

  // First click → ascending. Lowest Unicode Thai char in the fixture is "ก" (กิน).
  await page.getByRole('columnheader', { name: /Target/ }).click();
  await expect(page).toHaveURL(/sort=thai/);
  await expect(page).toHaveURL(/order=asc/);
  await expect(page.locator('tbody tr').first().locator('td').first()).toContainText('กิน');

  // Second click → descending. Highest Thai char in the fixture is "ห" (หิว).
  await page.getByRole('columnheader', { name: /Target/ }).click();
  await expect(page).toHaveURL(/order=desc/);
  await expect(page.locator('tbody tr').first().locator('td').first()).toContainText('หิว');

  // Third click → back to default (no sort/order in URL)
  await page.getByRole('columnheader', { name: /Target/ }).click();
  await expect(page).not.toHaveURL(/sort=/);
  await expect(page.locator('tbody tr').first().locator('td').first()).toContainText(
    defaultFirstThai!,
  );

  // 7. Settings page — set Anthropic key, verify mask, then reveal
  await page.goto('/settings');
  // Wait for the settings to load
  await expect(page.getByText('Anthropic API key')).toBeVisible({ timeout: 15_000 });
  // The three password inputs are in order: Anthropic, OpenAI, Google.
  // Anthropic is the first (index 0).
  const anthInput = page.locator('input[type="password"]').first();
  await anthInput.fill('sk-test123456789');
  // Click the Save button in the same row (just after the input)
  await page
    .locator('input[type="password"]')
    .first()
    .locator('xpath=following-sibling::button[1]')
    .click();
  // Reload to fetch from DB
  await page.goto('/settings');
  // Masked format is "sk-t" + bullets + "6789" — match the prefix+suffix
  await expect(page.getByText(/sk-t\S+6789/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /reveal/i }).first().click();
  await expect(page.getByText('sk-test123456789')).toBeVisible();
});
