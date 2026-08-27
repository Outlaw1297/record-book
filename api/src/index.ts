import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { apiKeyAuth, corsOrigin } from './auth.js';
import { migrate, ping, pool } from './db.js';
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

app.get('/oauth-clients', (c) =>
  c.json({
    googleClientId: (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
    dropboxAppKey: (process.env.DROPBOX_APP_KEY || '').trim(),
  }),
);

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
