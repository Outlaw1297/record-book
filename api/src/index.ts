import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { apiKeyAuth, corsOrigin } from './auth.js';
import { migrate, ping, pool, query } from './db.js';
import { oauth } from './oauth.js';
import { v1 } from './routes.js';

const app = new Hono({ strict: false });
const origin = corsOrigin();

app.use(
  '*',
  cors({
    origin: origin === '*' ? '*' : origin.split(',').map((value) => value.trim()),
    allowHeaders: ['Authorization', 'Content-Type', 'X-Api-Key'],
    allowMethods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
  }),
);

type OauthClients = {
  googleClientId: string;
  dropboxAppKey: string;
};

async function readOauthClients(): Promise<OauthClients> {
  const fromEnv: OauthClients = {
    googleClientId: (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
    dropboxAppKey: (process.env.DROPBOX_APP_KEY || '').trim(),
  };
  try {
    const result = await query<{
      google_client_id: string;
      dropbox_app_key: string;
    }>('SELECT google_client_id, dropbox_app_key FROM oauth_clients WHERE id = 1');
    const row = result.rows[0];
    return {
      googleClientId: fromEnv.googleClientId || (row?.google_client_id || '').trim(),
      dropboxAppKey: fromEnv.dropboxAppKey || (row?.dropbox_app_key || '').trim(),
    };
  } catch {
    return fromEnv;
  }
}

app.route('/oauth', oauth);

app.get('/oauth-clients', async (c) => c.json(await readOauthClients()));

app.put('/oauth-clients', apiKeyAuth(), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    googleClientId?: unknown;
    dropboxAppKey?: unknown;
  };
  const google =
    typeof body.googleClientId === 'string' ? body.googleClientId.trim() : undefined;
  const dropbox =
    typeof body.dropboxAppKey === 'string' ? body.dropboxAppKey.trim() : undefined;
  if (google === undefined && dropbox === undefined) {
    return c.json({ error: 'Send googleClientId and/or dropboxAppKey.' }, 400);
  }
  if (google !== undefined) {
    await query(
      'UPDATE oauth_clients SET google_client_id = $1, updated_at = NOW() WHERE id = 1',
      [google],
    );
  }
  if (dropbox !== undefined) {
    await query(
      'UPDATE oauth_clients SET dropbox_app_key = $1, updated_at = NOW() WHERE id = 1',
      [dropbox],
    );
  }
  return c.json(await readOauthClients());
});

function healthPayload() {
  return { ok: true as const, service: 'record-book-api' as const };
}

app.get('/', (c) => c.json(healthPayload()));
app.get('/health', (c) => c.json(healthPayload()));

app.get('/ready', async (c) => {
  try {
    const ok = await ping();
    return c.json({ ok }, ok ? 200 : 503);
  } catch (error) {
    return c.json(
      { ok: false, error: error instanceof Error ? error.message : 'db down' },
      503,
    );
  }
});

app.use('/v1', apiKeyAuth());
app.use('/v1/*', apiKeyAuth());
app.route('/v1', v1);

const port = Number(process.env.PORT || 8080);
const hostname = process.env.HOST || '0.0.0.0';

await migrate();
console.log(`record-book-api listening on ${hostname}:${port}`);

const server = serve({ fetch: app.fetch, port, hostname });

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
