import { db, ensureSettings, type SyncAuth } from '../db/schema';
import { RECORD_BOOK_FOLDER, type CloudCarrier, type CloudFile, type CloudProvider } from './types';
import { SharedFolder } from './sharedFolderPlugin';

function folderIdFrom(auth: SyncAuth | undefined): string {
  return (auth?.rootFolderId || auth?.accessToken || '').trim();
}

export async function connectSharedFolder(provider: CloudProvider): Promise<{
  name: string;
}> {
  const folder = await SharedFolder.pickFolder();
  const settings = await ensureSettings();
  const auth: SyncAuth = {
    id: 1,
    provider,
    accessToken: folder.id,
    expiresAt: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    accountName: folder.name,
    rootFolderId: folder.id,
  };
  await db.transaction('rw', db.syncAuth, db.settings, async () => {
    await db.syncAuth.put(auth);
    await db.settings.put({
      ...settings,
      syncProvider: provider,
      updatedAt: new Date().toISOString(),
    });
  });
  const carrier = new SharedFolderCarrier();
  await carrier.ensureRoot();
  return { name: folder.name };
}

async function requireFolderId(): Promise<string> {
  const auth = await db.syncAuth.get(1);
  const folderId = folderIdFrom(auth);
  if (!folderId) {
    throw new Error('Choose this ranch’s folder in Settings.');
  }
  return folderId;
}

export class SharedFolderCarrier implements CloudCarrier {
  readonly provider: CloudProvider = 'google-drive';

  async ensureRoot(): Promise<void> {
    const folderId = await requireFolderId();
    await SharedFolder.mkdir({ folderId, path: RECORD_BOOK_FOLDER });
    await SharedFolder.mkdir({ folderId, path: `${RECORD_BOOK_FOLDER}/snapshots` });
    await SharedFolder.mkdir({ folderId, path: `${RECORD_BOOK_FOLDER}/changes` });
  }

  private async full(path: string): Promise<{ folderId: string; path: string }> {
    const folderId = await requireFolderId();
    const trimmed = path.replace(/^\/+/, '');
    return { folderId, path: `${RECORD_BOOK_FOLDER}/${trimmed}` };
  }

  async readText(path: string): Promise<string | null> {
    const target = await this.full(path);
    const result = await SharedFolder.readFile(target);
    if (result.missing || result.data == null) return null;
    return result.data;
  }

  async writeText(
    path: string,
    text: string,
    _mode: 'add' | 'overwrite' = 'overwrite',
  ): Promise<void> {
    const target = await this.full(path);
    const parts = target.path.split('/').filter(Boolean);
    parts.pop();
    if (parts.length > 0) {
      await SharedFolder.mkdir({ folderId: target.folderId, path: parts.join('/') });
    }
    await SharedFolder.writeFile({ ...target, data: text });
  }

  async list(prefix: string): Promise<CloudFile[]> {
    const folderId = await requireFolderId();
    const trimmed = prefix.replace(/^\/+|\/+$/g, '');
    const rootPath = trimmed ? `${RECORD_BOOK_FOLDER}/${trimmed}` : RECORD_BOOK_FOLDER;
    return listRecursive(folderId, rootPath, trimmed);
  }
}

async function listRecursive(
  folderId: string,
  path: string,
  prefix: string,
): Promise<CloudFile[]> {
  const { entries } = await SharedFolder.readdir({ folderId, path });
  const files: CloudFile[] = [];
  for (const entry of entries) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    const childPath = `${path}/${entry.name}`;
    if (entry.isDir) {
      files.push(...(await listRecursive(folderId, childPath, key)));
    } else {
      files.push({
        key,
        updatedAt: entry.mtime ? new Date(entry.mtime).toISOString() : undefined,
      });
    }
  }
  return files;
}
