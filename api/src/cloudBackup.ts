import { applySnapshot, exportSnapshot } from './apply.js';
import { query } from './db.js';

export type CloudProvider = 'google-drive' | 'dropbox';

export type CloudAccountPublic = {
  provider: CloudProvider;
  accountEmail?: string;
  accountName?: string;
  lastBackupAt?: string;
  lastError?: string;
};

type CloudAccountRow = {
  provider: CloudProvider;
  access_token: string;
  refresh_token: string | null;
  expires_at: Date;
  account_email: string | null;
  account_name: string | null;
  client_id: string;
  last_backup_at: Date | null;
  last_error: string | null;
};

export type CloudCredentialInput = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number | string;
  accountEmail?: string;
  accountName?: string;
  clientId?: string;
};

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DROPBOX_API = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT = 'https://content.dropboxapi.com/2';
const RECORD_BOOK = 'RecordBook';
const SNAPSHOT_FILE = 'herd-latest.json';
const SNAPSHOT_PATH = `/${RECORD_BOOK}/snapshots/${SNAPSHOT_FILE}`;
const CLOUD_PROVIDERS: CloudProvider[] = ['dropbox', 'google-drive'];

let inflight: Promise<{ ok: boolean; detail: string }> | null = null;

export function asCloudProvider(value: string): CloudProvider | null {
  if (value === 'google-drive' || value === 'dropbox') return value;
  return null;
}

export function credentialsFromBody(body: unknown): CloudCredentialInput | string {
  if (!body || typeof body !== 'object') return 'Send accessToken and expiresAt.';
  const record = body as Record<string, unknown>;
  const accessToken = typeof record.accessToken === 'string' ? record.accessToken.trim() : '';
  if (!accessToken) return 'accessToken is required.';
  const expiresAt = record.expiresAt;
  if (typeof expiresAt !== 'number' && typeof expiresAt !== 'string') {
    return 'expiresAt is required.';
  }
  return {
    accessToken,
    refreshToken:
      typeof record.refreshToken === 'string' ? record.refreshToken.trim() : undefined,
    expiresAt,
    accountEmail: typeof record.accountEmail === 'string' ? record.accountEmail.trim() : undefined,
    accountName: typeof record.accountName === 'string' ? record.accountName.trim() : undefined,
    clientId: typeof record.clientId === 'string' ? record.clientId.trim() : undefined,
  };
}

function expiresDate(value: number | string): Date {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? new Date(Date.now() + 3600_000) : new Date(parsed);
}

export async function listCloudAccounts(): Promise<CloudAccountPublic[]> {
  const result = await query<CloudAccountRow>(
    `SELECT provider, access_token, refresh_token, expires_at, account_email, account_name,
            client_id, last_backup_at, last_error
     FROM cloud_accounts ORDER BY provider`,
  );
  return result.rows.map((row) => ({
    provider: row.provider,
    accountEmail: row.account_email || undefined,
    accountName: row.account_name || undefined,
    lastBackupAt: row.last_backup_at ? row.last_backup_at.toISOString() : undefined,
    lastError: row.last_error || undefined,
  }));
}

export async function saveCloudAccount(
  provider: CloudProvider,
  input: CloudCredentialInput,
): Promise<CloudAccountPublic> {
  const expires = expiresDate(input.expiresAt);
  await query(
    `INSERT INTO cloud_accounts (
       provider, access_token, refresh_token, expires_at, account_email, account_name, client_id, last_error, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NOW())
     ON CONFLICT (provider) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, cloud_accounts.refresh_token),
       expires_at = EXCLUDED.expires_at,
       account_email = COALESCE(EXCLUDED.account_email, cloud_accounts.account_email),
       account_name = COALESCE(EXCLUDED.account_name, cloud_accounts.account_name),
       client_id = CASE WHEN EXCLUDED.client_id = '' THEN cloud_accounts.client_id ELSE EXCLUDED.client_id END,
       last_error = NULL,
       updated_at = NOW()`,
    [
      provider,
      input.accessToken,
      input.refreshToken || null,
      expires.toISOString(),
      input.accountEmail || null,
      input.accountName || null,
      input.clientId || '',
    ],
  );
  const match = (await listCloudAccounts()).find((item) => item.provider === provider);
  if (!match) throw new Error('Cloud account did not save.');
  return match;
}

export async function deleteCloudAccount(provider: CloudProvider): Promise<void> {
  await query('DELETE FROM cloud_accounts WHERE provider = $1', [provider]);
}

async function loadAccount(provider: CloudProvider): Promise<CloudAccountRow | null> {
  const result = await query<CloudAccountRow>(
    `SELECT provider, access_token, refresh_token, expires_at, account_email, account_name,
            client_id, last_backup_at, last_error
     FROM cloud_accounts WHERE provider = $1`,
    [provider],
  );
  return result.rows[0] ?? null;
}

async function markError(provider: CloudProvider, message: string): Promise<void> {
  await query(
    'UPDATE cloud_accounts SET last_error = $2, updated_at = NOW() WHERE provider = $1',
    [provider, message.slice(0, 500)],
  );
}

async function markBackupOk(provider: CloudProvider, accessToken: string, expiresAt: Date): Promise<void> {
  await query(
    `UPDATE cloud_accounts
     SET access_token = $2, expires_at = $3, last_backup_at = NOW(), last_error = NULL, updated_at = NOW()
     WHERE provider = $1`,
    [provider, accessToken, expiresAt.toISOString()],
  );
}

async function refreshAccessToken(row: CloudAccountRow): Promise<{ token: string; expiresAt: Date }> {
  if (!row.refresh_token || !row.client_id) {
    return { token: row.access_token, expiresAt: row.expires_at };
  }
  const tokenUrl =
    row.provider === 'google-drive'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://api.dropboxapi.com/oauth2/token';
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
    client_id: row.client_id,
  });
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
    error?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || 'Could not refresh cloud login.');
  }
  const expiresAt = new Date(Date.now() + Math.max(60, json.expires_in || 3600) * 1000);
  await query(
    `UPDATE cloud_accounts SET access_token = $2, expires_at = $3, updated_at = NOW() WHERE provider = $1`,
    [row.provider, json.access_token, expiresAt.toISOString()],
  );
  return { token: json.access_token, expiresAt };
}

async function accessTokenFor(row: CloudAccountRow): Promise<{ token: string; expiresAt: Date }> {
  if (row.expires_at.getTime() - Date.now() > 120_000) {
    return { token: row.access_token, expiresAt: row.expires_at };
  }
  return refreshAccessToken(row);
}

async function dropboxCreateFolder(token: string, path: string): Promise<void> {
  const response = await fetch(`${DROPBOX_API}/files/create_folder_v2`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, autorename: false }),
  });
  if (response.ok) return;
  const json = (await response.json().catch(() => ({}))) as { error_summary?: string };
  if (String(json.error_summary || '').includes('conflict')) return;
  throw new Error(json.error_summary || 'Could not create Dropbox folder.');
}

async function backupDropbox(token: string, snapshot: unknown): Promise<void> {
  await dropboxCreateFolder(token, `/${RECORD_BOOK}`);
  await dropboxCreateFolder(token, `/${RECORD_BOOK}/snapshots`);
  const response = await fetch(`${DROPBOX_CONTENT}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: SNAPSHOT_PATH,
        mode: 'overwrite',
        mute: true,
        autorename: false,
      }),
    },
    body: JSON.stringify(snapshot),
  });
  if (!response.ok) throw new Error('Could not upload the herd to Dropbox.');
}

async function driveFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

async function driveFindChild(
  token: string,
  parentId: string,
  name: string,
  folder: boolean,
): Promise<{ id: string } | undefined> {
  const mimeClause = folder
    ? `and mimeType = '${FOLDER_MIME}'`
    : `and mimeType != '${FOLDER_MIME}'`;
  const safeName = name.replace(/'/g, "\\'");
  const queryText = new URLSearchParams({
    q: `name = '${safeName}' and '${parentId}' in parents and trashed = false ${mimeClause}`,
    fields: 'files(id,name)',
    pageSize: '1',
    spaces: 'drive',
  });
  const response = await driveFetch(token, `${FILES_URL}?${queryText.toString()}`);
  if (!response.ok) throw new Error('Could not search Google Drive.');
  const body = (await response.json()) as { files?: Array<{ id: string }> };
  return body.files?.[0];
}

async function driveCreateFolder(token: string, name: string, parentId?: string): Promise<string> {
  const response = await driveFetch(token, FILES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
    }),
  });
  if (!response.ok) throw new Error('Could not create a Google Drive folder.');
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function driveGetOrCreateFolder(
  token: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const existing = await driveFindChild(token, parentId ?? 'root', name, true);
  if (existing) return existing.id;
  return driveCreateFolder(token, name, parentId);
}

async function backupGoogle(token: string, snapshot: unknown): Promise<void> {
  const rootId = await driveGetOrCreateFolder(token, RECORD_BOOK);
  const snapshotsId = await driveGetOrCreateFolder(token, 'snapshots', rootId);
  const existing = await driveFindChild(token, snapshotsId, SNAPSHOT_FILE, false);
  const body = JSON.stringify(snapshot);
  if (existing) {
    const response = await driveFetch(
      token,
      `${UPLOAD_URL}/${existing.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    );
    if (!response.ok) throw new Error('Could not update the Google Drive backup.');
    return;
  }
  const metadata = JSON.stringify({ name: SNAPSHOT_FILE, parents: [snapshotsId] });
  const boundary = `recordbook_${Date.now()}`;
  const multipart =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${body}\r\n` +
    `--${boundary}--`;
  const response = await driveFetch(token, `${UPLOAD_URL}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  if (!response.ok) throw new Error('Could not upload the herd to Google Drive.');
}

async function backupOne(row: CloudAccountRow, snapshot: unknown): Promise<void> {
  const { token, expiresAt } = await accessTokenFor(row);
  if (row.provider === 'dropbox') await backupDropbox(token, snapshot);
  else await backupGoogle(token, snapshot);
  await markBackupOk(row.provider, token, expiresAt);
}

function providerLabel(provider: CloudProvider): string {
  return provider === 'dropbox' ? 'Dropbox' : 'Google Drive';
}

function snapshotExportedAtMs(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  const raw = (snapshot as { exportedAt?: unknown }).exportedAt;
  if (typeof raw !== 'string' && typeof raw !== 'number') return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

async function loadLatestCloudSnapshot(): Promise<{
  provider: CloudProvider;
  snapshot: Record<string, unknown>;
  exportedAt: number;
} | null> {
  let best: {
    provider: CloudProvider;
    snapshot: Record<string, unknown>;
    exportedAt: number;
  } | null = null;
  for (const provider of CLOUD_PROVIDERS) {
    try {
      const snapshot = await pullCloudSnapshot(provider);
      if (!snapshot || typeof snapshot !== 'object') continue;
      const exportedAt = snapshotExportedAtMs(snapshot);
      if (!best || exportedAt > best.exportedAt) {
        best = {
          provider,
          snapshot: snapshot as Record<string, unknown>,
          exportedAt,
        };
      }
    } catch (error) {
      await markError(
        provider,
        error instanceof Error ? error.message : 'Could not restore from cloud.',
      );
    }
  }
  return best;
}

async function restoreIfCloudNewer(rows: CloudAccountRow[]): Promise<void> {
  const latest = await loadLatestCloudSnapshot();
  if (!latest) return;
  const account = rows.find((row) => row.provider === latest.provider);
  const lastBackupMs = account?.last_backup_at?.getTime();
  if (
    lastBackupMs != null &&
    latest.exportedAt > 0 &&
    latest.exportedAt <= lastBackupMs
  ) {
    return;
  }
  await applySnapshot(latest.snapshot);
}

export async function backupAllToCloud(): Promise<{ ok: boolean; detail: string }> {
  if (inflight) return inflight;
  inflight = (async () => {
    const result = await query<CloudAccountRow>(
      `SELECT provider, access_token, refresh_token, expires_at, account_email, account_name,
              client_id, last_backup_at, last_error
       FROM cloud_accounts`,
    );
    if (result.rows.length === 0) {
      return { ok: true, detail: 'No Dropbox or Google login stored on this NAS yet.' };
    }
    await restoreIfCloudNewer(result.rows);
    const snapshot = await exportSnapshot();
    const ok: string[] = [];
    const failed: string[] = [];
    for (const row of result.rows) {
      try {
        await backupOne(row, snapshot);
        ok.push(providerLabel(row.provider));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Backup failed.';
        await markError(row.provider, message);
        failed.push(message);
      }
    }
    if (failed.length > 0 && ok.length === 0) {
      return { ok: false, detail: failed.join(' ') };
    }
    return {
      ok: true,
      detail:
        ok.length > 0
          ? `NAS copied the herd to ${ok.join(' and ')}.`
          : failed.join(' '),
    };
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function startCloudBackupLoop(): void {
  const tick = () => {
    void backupAllToCloud().catch((error) => {
      console.error('NAS cloud backup failed', error);
    });
  };
  void restoreNasFromCloud()
    .catch((error) => {
      console.error('NAS cloud restore failed', error);
    })
    .finally(() => {
      setTimeout(tick, 20_000);
      setInterval(tick, 120_000);
    });
}

export async function pullCloudSnapshot(provider: CloudProvider): Promise<unknown | null> {
  const row = await loadAccount(provider);
  if (!row) return null;
  const { token } = await accessTokenFor(row);
  if (provider === 'dropbox') {
    const response = await fetch(`${DROPBOX_CONTENT}/files/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path: SNAPSHOT_PATH }),
      },
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  }
  const rootId = await driveGetOrCreateFolder(token, RECORD_BOOK);
  const snapshotsId = await driveGetOrCreateFolder(token, 'snapshots', rootId);
  const existing = await driveFindChild(token, snapshotsId, SNAPSHOT_FILE, false);
  if (!existing) return null;
  const response = await driveFetch(token, `${FILES_URL}/${existing.id}?alt=media`);
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export async function restoreNasFromCloud(): Promise<{ applied: number; detail: string }> {
  const latest = await loadLatestCloudSnapshot();
  if (!latest) {
    return { applied: 0, detail: 'No newer cloud copy to apply.' };
  }
  const result = await applySnapshot(latest.snapshot);
  return {
    applied: result.applied,
    detail:
      result.applied > 0
        ? `NAS applied ${result.applied} row(s) from ${providerLabel(latest.provider)}.`
        : 'No newer cloud copy to apply.',
  };
}
