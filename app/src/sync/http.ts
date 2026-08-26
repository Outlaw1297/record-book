export async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const record = body as Record<string, unknown>;
  const error = record.error;
  if (typeof record.error_description === 'string') return record.error_description;
  if (typeof record.error_summary === 'string') return record.error_summary;
  if (error && typeof error === 'object') {
    const nested = error as Record<string, unknown>;
    if (typeof nested.message === 'string') return nested.message;
  }
  if (typeof error === 'string') return error;
  return fallback;
}

export async function assertOk(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const body = await readJsonBody(response);
  throw new Error(errorMessage(body, fallback));
}
