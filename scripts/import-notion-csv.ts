// CLI fallback for CSV import. Useful for seeding the user's own data
// without going through the web UI.
//
// Usage:
//   pnpm tsx scripts/import-notion-csv.ts <user_email> <csv_path>

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { users } from '../src/db/schema';
import { importNotionCsvForUser } from '../src/lib/csv-import';

async function main() {
  const [userEmail, csvPath] = process.argv.slice(2);
  if (!userEmail || !csvPath) {
    console.error('Usage: pnpm tsx scripts/import-notion-csv.ts <user_email> <csv_path>');
    process.exit(2);
  }

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, userEmail.toLowerCase().trim()))
    .limit(1);
  if (!user) {
    console.error(`No user found with email ${userEmail}`);
    process.exit(1);
  }

  const csv = readFileSync(path.resolve(csvPath), 'utf8');
  console.log(`Importing ${csv.length} bytes for ${user.email}…`);
  const result = await importNotionCsvForUser(user.id, csv);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
