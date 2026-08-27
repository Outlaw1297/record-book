import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  applyChange,
  applySnapshot,
  exportSnapshot,
  upsertAnimal,
  upsertBreeding,
  upsertCowCalf,
  upsertDevice,
  upsertPasture,
  upsertPastureAnimal,
  upsertRanch,
  upsertSale,
} from './apply.js';
import { query } from './db.js';
import {
  animalFromDb,
  breedingFromDb,
  cowCalfFromDb,
  deviceFromDb,
  pastureAnimalFromDb,
  pastureFromDb,
  ranchFromDb,
  saleFromDb,
} from './maps.js';

type Json = Record<string, unknown>;
type Row = Record<string, unknown>;

function includeDeleted(c: { req: { query: (name: string) => string | undefined } }): boolean {
  return c.req.query('includeDeleted') === 'true';
}

function yearFilter(c: { req: { query: (name: string) => string | undefined } }): number | null {
  const raw = c.req.query('year');
  if (!raw) return null;
  const year = Number(raw);
  return Number.isFinite(year) ? year : null;
}

export const v1 = new Hono({ strict: false });

v1.get('/', (c) =>
  c.json({
    name: 'record-book-api',
    version: 1,
    docs: {
      health: 'GET /health',
      export: 'GET /v1/export',
      snapshot: 'POST /v1/sync/snapshot',
      changes: 'POST /v1/sync/changes',
      collections: [
        '/v1/ranch',
        '/v1/animals',
        '/v1/cow-calf',
        '/v1/breeding',
        '/v1/pastures',
        '/v1/pasture-animals',
        '/v1/sales',
        '/v1/devices',
      ],
    },
    auth: 'Authorization: Bearer <API_KEY> or X-Api-Key: <API_KEY>',
  }),
);

v1.get('/export', async (c) => c.json(await exportSnapshot()));

v1.get('/ranch', async (c) => {
  const result = await query('SELECT * FROM ranch WHERE id = 1');
  return c.json(result.rows[0] ? ranchFromDb(result.rows[0]) : null);
});

v1.put('/ranch', async (c) => {
  const body = (await c.req.json()) as Json;
  await upsertRanch(body);
  const result = await query('SELECT * FROM ranch WHERE id = 1');
  return c.json(ranchFromDb(result.rows[0]));
});

v1.get('/animals', async (c) => {
  const deleted = includeDeleted(c);
  const result = await query(
    `SELECT * FROM animals ${deleted ? '' : 'WHERE deleted_at IS NULL'} ORDER BY lower(herd_id)`,
  );
  return c.json(result.rows.map(animalFromDb));
});

v1.get('/animals/:id', async (c) => {
  const result = await query('SELECT * FROM animals WHERE id = $1', [c.req.param('id')]);
  if (!result.rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json(animalFromDb(result.rows[0]));
});

const LOOKUP_TABLES = [
  'animals',
  'cow_calf',
  'breeding',
  'pastures',
  'pasture_animals',
  'sales',
] as const;

type LookupTable = (typeof LOOKUP_TABLES)[number];

function lookupTable(table: string): LookupTable {
  if (!(LOOKUP_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Invalid table ${table}`);
  }
  return table as LookupTable;
}

async function getById(c: Context, table: LookupTable, fromDb: (row: Row) => unknown) {
  const safe = lookupTable(table);
  const result = await query(`SELECT * FROM ${safe} WHERE id = $1`, [c.req.param('id')]);
  if (!result.rows[0]) return c.json({ error: 'Not found' }, 404);
  return c.json(fromDb(result.rows[0]));
}

async function softDelete(
  c: Context,
  table: LookupTable,
  fromDb: (row: Row) => Json,
  upsert: (payload: Json) => Promise<unknown>,
) {
  const safe = lookupTable(table);
  const result = await query(`SELECT * FROM ${safe} WHERE id = $1`, [c.req.param('id')]);
  if (!result.rows[0]) return c.json({ error: 'Not found' }, 404);
  const now = new Date().toISOString();
  await upsert({ ...fromDb(result.rows[0]), updatedAt: now, deletedAt: now });
  return c.json({ ok: true });
}

v1.put('/animals/:id', async (c) => {
  const body = { ...((await c.req.json()) as Json), id: c.req.param('id') };
  await upsertAnimal(body);
  const result = await query('SELECT * FROM animals WHERE id = $1', [c.req.param('id')]);
  return c.json(animalFromDb(result.rows[0]));
});

v1.delete('/animals/:id', (c) => softDelete(c, 'animals', animalFromDb, upsertAnimal));

v1.get('/cow-calf', async (c) => {
  const year = yearFilter(c);
  const deleted = includeDeleted(c);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!deleted) clauses.push('deleted_at IS NULL');
  if (year != null) {
    params.push(year);
    clauses.push(`year = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM cow_calf ${where} ORDER BY year DESC, lower(cow_id)`,
    params,
  );
  return c.json(result.rows.map(cowCalfFromDb));
});

v1.get('/cow-calf/:id', (c) => getById(c, 'cow_calf', cowCalfFromDb));

v1.put('/cow-calf/:id', async (c) => {
  const body = { ...((await c.req.json()) as Json), id: c.req.param('id') };
  await upsertCowCalf(body);
  const result = await query('SELECT * FROM cow_calf WHERE id = $1', [c.req.param('id')]);
  return c.json(cowCalfFromDb(result.rows[0]));
});

v1.delete('/cow-calf/:id', (c) => softDelete(c, 'cow_calf', cowCalfFromDb, upsertCowCalf));

v1.get('/breeding', async (c) => {
  const year = yearFilter(c);
  const deleted = includeDeleted(c);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!deleted) clauses.push('deleted_at IS NULL');
  if (year != null) {
    params.push(year);
    clauses.push(`year = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM breeding ${where} ORDER BY year DESC, lower(cow_id)`,
    params,
  );
  return c.json(result.rows.map(breedingFromDb));
});

v1.get('/breeding/:id', (c) => getById(c, 'breeding', breedingFromDb));

v1.put('/breeding/:id', async (c) => {
  const body = { ...((await c.req.json()) as Json), id: c.req.param('id') };
  await upsertBreeding(body);
  const result = await query('SELECT * FROM breeding WHERE id = $1', [c.req.param('id')]);
  return c.json(breedingFromDb(result.rows[0]));
});

v1.delete('/breeding/:id', (c) => softDelete(c, 'breeding', breedingFromDb, upsertBreeding));

v1.get('/pastures', async (c) => {
  const year = yearFilter(c);
  const deleted = includeDeleted(c);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!deleted) clauses.push('deleted_at IS NULL');
  if (year != null) {
    params.push(year);
    clauses.push(`year = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM pastures ${where} ORDER BY year DESC, pasture_name`,
    params,
  );
  return c.json(result.rows.map(pastureFromDb));
});

v1.get('/pastures/:id', (c) => getById(c, 'pastures', pastureFromDb));

v1.put('/pastures/:id', async (c) => {
  const body = { ...((await c.req.json()) as Json), id: c.req.param('id') };
  await upsertPasture(body);
  const result = await query('SELECT * FROM pastures WHERE id = $1', [c.req.param('id')]);
  return c.json(pastureFromDb(result.rows[0]));
});

v1.delete('/pastures/:id', (c) =>
  softDelete(c, 'pastures', pastureFromDb, upsertPasture),
);

v1.get('/pasture-animals', async (c) => {
  const exposureId = c.req.query('exposureId');
  const deleted = includeDeleted(c);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!deleted) clauses.push('deleted_at IS NULL');
  if (exposureId) {
    params.push(exposureId);
    clauses.push(`exposure_id = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM pasture_animals ${where} ORDER BY exposure_id`,
    params,
  );
  return c.json(result.rows.map(pastureAnimalFromDb));
});

v1.get('/pasture-animals/:id', (c) => getById(c, 'pasture_animals', pastureAnimalFromDb));

v1.put('/pasture-animals/:id', async (c) => {
  const body = { ...((await c.req.json()) as Json), id: c.req.param('id') };
  await upsertPastureAnimal(body);
  const result = await query('SELECT * FROM pasture_animals WHERE id = $1', [
    c.req.param('id'),
  ]);
  return c.json(pastureAnimalFromDb(result.rows[0]));
});

v1.delete('/pasture-animals/:id', (c) =>
  softDelete(c, 'pasture_animals', pastureAnimalFromDb, upsertPastureAnimal),
);

v1.get('/sales', async (c) => {
  const year = yearFilter(c);
  const deleted = includeDeleted(c);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (!deleted) clauses.push('deleted_at IS NULL');
  if (year != null) {
    params.push(year);
    clauses.push(`year = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM sales ${where} ORDER BY year DESC, lower(calf_id)`,
    params,
  );
  return c.json(result.rows.map(saleFromDb));
});

v1.get('/sales/:id', (c) => getById(c, 'sales', saleFromDb));

v1.put('/sales/:id', async (c) => {
  const body = { ...((await c.req.json()) as Json), id: c.req.param('id') };
  await upsertSale(body);
  const result = await query('SELECT * FROM sales WHERE id = $1', [c.req.param('id')]);
  return c.json(saleFromDb(result.rows[0]));
});

v1.delete('/sales/:id', (c) => softDelete(c, 'sales', saleFromDb, upsertSale));

v1.get('/devices', async (c) => {
  const result = await query('SELECT * FROM devices ORDER BY device_name');
  return c.json(result.rows.map(deviceFromDb));
});

v1.put('/devices/:id', async (c) => {
  const body = { ...((await c.req.json()) as Json), deviceId: c.req.param('id') };
  await upsertDevice(body);
  const result = await query('SELECT * FROM devices WHERE device_id = $1', [c.req.param('id')]);
  return c.json(deviceFromDb(result.rows[0]));
});

v1.post('/sync/snapshot', async (c) => {
  const body = (await c.req.json()) as Json;
  const result = await applySnapshot(body);
  return c.json({ ok: true, ...result });
});

v1.post('/sync/changes', async (c) => {
  const body = (await c.req.json()) as Json;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  let applied = 0;
  let kept = 0;
  let skipped = 0;
  if (body.deviceId) {
    await upsertDevice({
      deviceId: body.deviceId,
      deviceName: body.deviceName || 'Device',
      operatorName: body.operatorName,
      kind: body.kind,
      lastSeenAt: new Date().toISOString(),
    });
  }
  for (const change of changes) {
    if (!change || typeof change !== 'object') {
      skipped += 1;
      continue;
    }
    const result = await applyChange(change as Json);
    if (result === 'applied') applied += 1;
    else if (result === 'kept') kept += 1;
    else skipped += 1;
  }
  return c.json({ ok: true, applied, kept, skipped });
});
