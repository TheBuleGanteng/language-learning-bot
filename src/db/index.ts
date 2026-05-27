import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __lang_pg_pool__: Pool | undefined;
}

function getDb(): NodePgDatabase<typeof schema> {
  const pool =
    global.__lang_pg_pool__ ??
    new Pool({ connectionString: process.env.DATABASE_URL });
  if (process.env.NODE_ENV !== 'production') {
    global.__lang_pg_pool__ = pool;
  }
  return drizzle(pool, { schema });
}

// Lazy: only initializes on first property access
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop) {
    const realDb = getDb();
    return Reflect.get(realDb, prop);
  },
});

export { schema };