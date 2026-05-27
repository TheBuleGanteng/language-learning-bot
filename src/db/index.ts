import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __lang_pg_pool__: Pool | undefined;
}

const pool =
  global.__lang_pg_pool__ ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== 'production') {
  global.__lang_pg_pool__ = pool;
}

export const db = drizzle(pool, { schema });
export { schema };
