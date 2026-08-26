import { requireAccessToken } from './auth';
import { assertOk, readJsonBody } from './http';
import type { CloudCarrier, CloudFile, CloudProvider } from './types';
import { RECORD_BOOK_FOLDER } from './types';

const ROOT = `/${RECORD_BOOK_FOLDER}`;
const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

function fullPath(path: string): string {
  const trimmed = path.replace(/^\/+/, '');
  return `${ROOT}/${trimmed}`;
}

function relativeKey(dropboxPath: string): string {
  const prefix = `${ROOT}/`;
  return dropboxPath.startsWith(prefix)
    ? dropboxPath.slice(prefix.length)
    : dropboxPath.replace(/^\/+/, '');
}

type DropboxListResult = {
  entries?: Array<{
    '.tag'?: string;
    path_display?: string;
    path_lower?: string;
    server_modified?: string;
  }>;
  has_more?: boolean;
  cursor?: string;
};

async function dropboxFetch(
  token: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

function isNotFound(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  const summary = String(record.error_summary ?? '');
  return summary.includes('not_found') || summary.includes('path/not_found');
}

async function createFolder(token: string, path: string): Promise<void> {
  const response = await dropboxFetch(token, `${API}/files/create_folder_v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, autorename: false }),
  });
  if (response.ok) return;
  const body = await readJsonBody(response);
  const summary =
    body && typeof body === 'object'
      ? String((body as Record<string, unknown>).error_summary ?? '')
      : '';
  if (summary.includes('conflict')) return;
  throw new Error(
    summary || 'Could not create the RecordBook folder in Dropbox.',
  );
}

export class DropboxCarrier implements CloudCarrier {
  readonly provider: CloudProvider = 'dropbox';

  async ensureRoot(): Promise<void> {
    const { token } = await requireAccessToken();
    await createFolder(token, ROOT);
    await createFolder(token, `${ROOT}/snapshots`);
    await createFolder(token, `${ROOT}/changes`);
  }

  async readText(path: string): Promise<string | null> {
    const { token } = await requireAccessToken();
    const response = await dropboxFetch(token, `${CONTENT}/files/download`, {
      method: 'POST',
      headers: {
        'Dropbox-API-Arg': JSON.stringify({ path: fullPath(path) }),
      },
    });
    if (!response.ok) {
      const body = await readJsonBody(response);
      if (isNotFound(body) || response.status === 409) return null;
      throw new Error('Could not download from Dropbox.');
    }
    return response.text();
  }

  async writeText(
    path: string,
    text: string,
    mode: 'add' | 'overwrite' = 'overwrite',
  ): Promise<void> {
    const { token } = await requireAccessToken();
    await this.ensureRoot();
    const parts = path.split('/').filter(Boolean);
    if (parts.length > 1) {
      let cursor = ROOT;
      for (const folder of parts.slice(0, -1)) {
        cursor += `/${folder}`;
        await createFolder(token, cursor);
      }
    }
    const response = await dropboxFetch(token, `${CONTENT}/files/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': JSON.stringify({
          path: fullPath(path),
          mode: mode === 'add' ? 'add' : 'overwrite',
          mute: true,
          autorename: false,
        }),
      },
      body: text,
    });
    await assertOk(response, 'Could not upload to Dropbox.');
  }

  async list(prefix: string): Promise<CloudFile[]> {
    const { token } = await requireAccessToken();
    await this.ensureRoot();
    const path = fullPath(prefix.replace(/\/$/, ''));
    const files: CloudFile[] = [];

    const first = await dropboxFetch(token, `${API}/files/list_folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        recursive: true,
        include_deleted: false,
      }),
    });
    if (!first.ok) {
      const errorBody = await readJsonBody(first);
      if (isNotFound(errorBody)) return [];
      throw new Error('Could not list Dropbox files.');
    }

    let body: DropboxListResult | null = (await first.json()) as DropboxListResult;

    while (body) {
      for (const entry of body.entries ?? []) {
        if (entry['.tag'] !== 'file') continue;
        const dropboxPath = entry.path_display || entry.path_lower || '';
        files.push({
          key: relativeKey(dropboxPath),
          updatedAt: entry.server_modified,
        });
      }
      if (!body.has_more || !body.cursor) break;
      const next = await dropboxFetch(token, `${API}/files/list_folder/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor: body.cursor }),
      });
      await assertOk(next, 'Could not list Dropbox files.');
      body = (await next.json()) as DropboxListResult;
    }

    return files;
  }
}
