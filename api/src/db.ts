import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const transaction = new AsyncLocalStorage<pg.PoolClient>();

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  const client = transaction.getStore();
  if (client) return client.query<T>(text, params);
  return pool.query<T>(text, params);
}

/** One connection, one commit — a Cow Sense import is tens of thousands of upserts. */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const existing = transaction.getStore();
  if (existing) return fn();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await transaction.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sqlDir = path.resolve(here, '../sql');
  const files = (await fs.readdir(sqlDir)).filter((name) => name.endsWith('.sql')).sort();
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  for (const file of files) {
    const applied = await query<{ id: string }>(
      'SELECT id FROM schema_migrations WHERE id = $1',
      [file],
    );
    if (applied.rowCount) continue;
    const sql = await fs.readFile(path.join(sqlDir, file), 'utf8');
    await query(sql);
    await query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
  }
}

export async function ping(): Promise<boolean> {
  const result = await query('SELECT 1 AS ok');
  return (result.rowCount ?? 0) > 0;
}
