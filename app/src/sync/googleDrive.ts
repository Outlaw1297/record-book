import { getAuthFor, requireAccessToken, saveAuthFolders } from './auth';
import { assertOk, readJsonBody } from './http';
import type { CloudCarrier, CloudFile, CloudProvider } from './types';
import { RECORD_BOOK_FOLDER } from './types';
import { newId } from '../db/schema';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
};

async function driveFetch(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

async function listChildren(
  token: string,
  folderId: string,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)',
      pageSize: '100',
      spaces: 'drive',
    });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await driveFetch(token, `${FILES_URL}?${query.toString()}`);
    await assertOk(response, 'Could not list Google Drive files.');
    const body = (await response.json()) as {
      files?: DriveFile[];
      nextPageToken?: string;
    };
    files.push(...(body.files ?? []));
    pageToken = body.nextPageToken ?? '';
  } while (pageToken);
  return files;
}

async function findChild(
  token: string,
  folderId: string,
  name: string,
  folder: boolean,
): Promise<DriveFile | undefined> {
  const mimeClause = folder
    ? `and mimeType = '${FOLDER_MIME}'`
    : `and mimeType != '${FOLDER_MIME}'`;
  const safeName = name.replace(/'/g, "\\'");
  const query = new URLSearchParams({
    q: `name = '${safeName}' and '${folderId}' in parents and trashed = false ${mimeClause}`,
    fields: 'files(id,name,mimeType,modifiedTime)',
    pageSize: '1',
    spaces: 'drive',
  });
  const response = await driveFetch(token, `${FILES_URL}?${query.toString()}`);
  await assertOk(response, 'Could not search Google Drive.');
  const body = (await response.json()) as { files?: DriveFile[] };
  return body.files?.[0];
}

async function createFolder(
  token: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const response = await driveFetch(token, `${FILES_URL}?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
    }),
  });
  await assertOk(response, 'Could not create the RecordBook folder in Drive.');
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function getOrCreateFolder(
  token: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const existing = await findChild(token, parentId ?? 'root', name, true);
  if (existing) return existing.id;
  return createFolder(token, name, parentId);
}

async function ensureFolders(token: string): Promise<{
  rootFolderId: string;
  snapshotsFolderId: string;
  changesFolderId: string;
}> {
  const auth = await getAuthFor('google-drive');
  if (auth?.rootFolderId && auth.snapshotsFolderId && auth.changesFolderId) {
    const probe = await driveFetch(
      token,
      `${FILES_URL}/${auth.rootFolderId}?fields=id,trashed`,
    );
    if (probe.ok) {
      const body = (await readJsonBody(probe)) as { trashed?: boolean } | null;
      if (body && body.trashed !== true) {
        return {
          rootFolderId: auth.rootFolderId,
          snapshotsFolderId: auth.snapshotsFolderId,
          changesFolderId: auth.changesFolderId,
        };
      }
    }
  }

  const rootFolderId = await getOrCreateFolder(token, RECORD_BOOK_FOLDER);
  const snapshotsFolderId = await getOrCreateFolder(
    token,
    'snapshots',
    rootFolderId,
  );
  const changesFolderId = await getOrCreateFolder(token, 'changes', rootFolderId);
  await saveAuthFolders('google-drive', { rootFolderId, snapshotsFolderId, changesFolderId });
  return { rootFolderId, snapshotsFolderId, changesFolderId };
}

async function resolveParent(
  token: string,
  path: string,
): Promise<{ parentId: string; name: string }> {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  if (!name) throw new Error('Invalid Drive path.');
  const folders = await ensureFolders(token);
  if (parts.length === 0) return { parentId: folders.rootFolderId, name };
  if (parts[0] === 'snapshots') {
    return { parentId: folders.snapshotsFolderId, name };
  }
  if (parts[0] === 'changes') {
    let parentId = folders.changesFolderId;
    for (const folderName of parts.slice(1)) {
      parentId = await getOrCreateFolder(token, folderName, parentId);
    }
    return { parentId, name };
  }
  let parentId = folders.rootFolderId;
  for (const folderName of parts) {
    parentId = await getOrCreateFolder(token, folderName, parentId);
  }
  return { parentId, name };
}

async function uploadNew(
  token: string,
  parentId: string,
  name: string,
  text: string,
): Promise<void> {
  const metadata = JSON.stringify({ name, parents: [parentId] });
  const boundary = 'recordbook_' + newId();
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    `${text}\r\n` +
    `--${boundary}--`;
  const response = await driveFetch(
    token,
    `${UPLOAD_URL}?uploadType=multipart&fields=id`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  await assertOk(response, 'Could not upload to Google Drive.');
}

async function updateFile(token: string, fileId: string, text: string): Promise<void> {
  const response = await driveFetch(
    token,
    `${UPLOAD_URL}/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
      body: text,
    },
  );
  await assertOk(response, 'Could not update the Drive file.');
}

async function listRecursive(
  token: string,
  folderId: string,
  prefix: string,
): Promise<CloudFile[]> {
  const children = await listChildren(token, folderId);
  const files: CloudFile[] = [];
  for (const child of children) {
    const key = prefix ? `${prefix}/${child.name}` : child.name;
    if (child.mimeType === FOLDER_MIME) {
      files.push(...(await listRecursive(token, child.id, key)));
    } else {
      files.push({ key, updatedAt: child.modifiedTime });
    }
  }
  return files;
}

export class GoogleDriveCarrier implements CloudCarrier {
  readonly provider: CloudProvider = 'google-drive';

  async ensureRoot(): Promise<void> {
    const { token } = await requireAccessToken('google-drive');
    await ensureFolders(token);
  }

  async readText(path: string): Promise<string | null> {
    const { token } = await requireAccessToken('google-drive');
    const { parentId, name } = await resolveParent(token, path);
    const file = await findChild(token, parentId, name, false);
    if (!file) return null;
    const response = await driveFetch(
      token,
      `${FILES_URL}/${file.id}?alt=media`,
    );
    if (response.status === 404) return null;
    await assertOk(response, 'Could not download from Google Drive.');
    return response.text();
  }

  async writeText(
    path: string,
    text: string,
    mode: 'add' | 'overwrite' = 'overwrite',
  ): Promise<void> {
    const { token } = await requireAccessToken('google-drive');
    const { parentId, name } = await resolveParent(token, path);
    const existing = mode === 'add' ? undefined : await findChild(token, parentId, name, false);
    if (existing) {
      await updateFile(token, existing.id, text);
      return;
    }
    await uploadNew(token, parentId, name, text);
  }

  async list(prefix: string): Promise<CloudFile[]> {
    const { token } = await requireAccessToken('google-drive');
    const folders = await ensureFolders(token);
    const trimmed = prefix.replace(/\/$/, '');
    if (trimmed === 'changes' || trimmed.startsWith('changes/')) {
      return listRecursive(token, folders.changesFolderId, 'changes');
    }
    if (trimmed === 'snapshots') {
      return listRecursive(token, folders.snapshotsFolderId, 'snapshots');
    }
    return listRecursive(token, folders.rootFolderId, '');
  }
}
