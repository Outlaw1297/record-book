import { requireAccessToken, saveAuthFolders } from './auth';
import { assertOk } from './http';
import type { CloudCarrier, CloudFile, CloudProvider } from './types';
import { RECORD_BOOK_FOLDER } from './types';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  createdTime?: string;
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

function compareDriveFiles(a: DriveFile, b: DriveFile): number {
  const ta = a.createdTime ?? a.modifiedTime ?? '';
  const tb = b.createdTime ?? b.modifiedTime ?? '';
  if (ta && tb && ta !== tb) return ta.localeCompare(tb);
  if (ta && !tb) return -1;
  if (!ta && tb) return 1;
  return a.id.localeCompare(b.id);
}

function pickCanonical(files: DriveFile[]): DriveFile | undefined {
  if (files.length === 0) return undefined;
  return files.reduce((best, file) =>
    compareDriveFiles(file, best) < 0 ? file : best,
  );
}

async function findChildren(
  token: string,
  folderId: string,
  name: string,
  folder: boolean,
): Promise<DriveFile[]> {
  const mimeClause = folder
    ? `and mimeType = '${FOLDER_MIME}'`
    : `and mimeType != '${FOLDER_MIME}'`;
  const safeName = name.replace(/'/g, "\\'");
  const files: DriveFile[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({
      q: `name = '${safeName}' and '${folderId}' in parents and trashed = false ${mimeClause}`,
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,createdTime)',
      pageSize: '100',
      spaces: 'drive',
    });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await driveFetch(token, `${FILES_URL}?${query.toString()}`);
    await assertOk(response, 'Could not search Google Drive.');
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
  return pickCanonical(await findChildren(token, folderId, name, folder));
}

async function trashFile(token: string, fileId: string): Promise<void> {
  await driveFetch(token, `${FILES_URL}/${fileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
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
  const parent = parentId ?? 'root';
  const existing = await findChild(token, parent, name, true);
  if (existing) return existing.id;
  const createdId = await createFolder(token, name, parentId);
  const canonical = await findChild(token, parent, name, true);
  if (canonical && canonical.id !== createdId) {
    await trashFile(token, createdId);
    return canonical.id;
  }
  return createdId;
}

async function ensureFolders(token: string): Promise<{
  rootFolderId: string;
  snapshotsFolderId: string;
  changesFolderId: string;
}> {
  const rootFolderId = await getOrCreateFolder(token, RECORD_BOOK_FOLDER);
  const snapshotsFolderId = await getOrCreateFolder(
    token,
    'snapshots',
    rootFolderId,
  );
  const changesFolderId = await getOrCreateFolder(token, 'changes', rootFolderId);
  await saveAuthFolders({ rootFolderId, snapshotsFolderId, changesFolderId });
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
): Promise<string> {
  const metadata = JSON.stringify({ name, parents: [parentId] });
  const boundary = 'recordbook_' + crypto.randomUUID();
  const multipart =
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
      body: multipart,
    },
  );
  await assertOk(response, 'Could not upload to Google Drive.');
  const created = (await response.json()) as { id: string };
  return created.id;
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
    const { token } = await requireAccessToken();
    await ensureFolders(token);
  }

  async readText(path: string): Promise<string | null> {
    const { token } = await requireAccessToken();
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
    const { token } = await requireAccessToken();
    const { parentId, name } = await resolveParent(token, path);
    const existing = mode === 'add' ? undefined : await findChild(token, parentId, name, false);
    if (existing) {
      await updateFile(token, existing.id, text);
      return;
    }
    const uploadedId = await uploadNew(token, parentId, name, text);
    if (mode === 'overwrite') {
      const canonical = await findChild(token, parentId, name, false);
      if (canonical && canonical.id !== uploadedId) {
        await updateFile(token, canonical.id, text);
        await trashFile(token, uploadedId);
      }
    }
  }

  async list(prefix: string): Promise<CloudFile[]> {
    const { token } = await requireAccessToken();
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
