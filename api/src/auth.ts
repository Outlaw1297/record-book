import type { MiddlewareHandler } from 'hono';

export function apiKeyAuth(): MiddlewareHandler {
  const expected = (process.env.API_KEY || '').trim();
  return async (c, next) => {
    if (!expected) {
      return c.json({ error: 'API_KEY is not configured on the server.' }, 500);
    }
    const header = c.req.header('authorization') || c.req.header('x-api-key') || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token || token !== expected) {
      return c.json({ error: 'Unauthorized. Send Authorization: Bearer <API_KEY>.' }, 401);
    }
    await next();
  };
}

export function corsOrigin(): string {
  return (process.env.CORS_ORIGIN || '*').trim() || '*';
}
