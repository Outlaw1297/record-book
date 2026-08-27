import { registerPlugin, WebPlugin } from '@capacitor/core';

export type SharedFolderRef = {
  id: string;
  name: string;
};

export type SharedFolderEntry = {
  name: string;
  isDir: boolean;
  mtime?: number | null;
};

type SharedFolderApi = {
  pickFolder(): Promise<SharedFolderRef>;
  writeFile(options: { folderId: string; path: string; data: string }): Promise<void>;
  readFile(options: { folderId: string; path: string }): Promise<{ data?: string; missing?: boolean }>;
  mkdir(options: { folderId: string; path: string }): Promise<void>;
  readdir(options: {
    folderId: string;
    path: string;
  }): Promise<{ entries: SharedFolderEntry[] }>;
  exists(options: {
    folderId: string;
    path: string;
  }): Promise<{ exists: boolean; isDirectory: boolean }>;
};

const HANDLE_DB = 'record-book-folder';
const HANDLE_STORE = 'handles';
const WEB_FOLDER_ID = 'fsa';

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveWebHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    tx.objectStore(HANDLE_STORE).put(handle, WEB_FOLDER_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadWebHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const request = tx.objectStore(HANDLE_STORE).get(WEB_FOLDER_ID);
      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle) || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite';
  }) => Promise<FileSystemDirectoryHandle>;
};

type PermissionedDirectory = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
};

async function queryPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const withPerm = handle as PermissionedDirectory;
  const mode = { mode: 'readwrite' as const };
  if (typeof withPerm.queryPermission === 'function') {
    const current = await withPerm.queryPermission(mode);
    if (current === 'granted') return true;
  }
  if (typeof withPerm.requestPermission === 'function') {
    const next = await withPerm.requestPermission(mode);
    return next === 'granted';
  }
  return true;
}

async function dirAt(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  let current = root;
  const parts = path.split('/').filter((part) => part && part !== '.');
  for (const part of parts) {
    try {
      current = await current.getDirectoryHandle(part, { create });
    } catch {
      if (!create) return null;
      throw new Error(`Could not open folder ${part}`);
    }
  }
  return current;
}

class SharedFolderWeb extends WebPlugin implements SharedFolderApi {
  async pickFolder(): Promise<SharedFolderRef> {
    const picker = window as DirectoryPickerWindow;
    if (typeof picker.showDirectoryPicker !== 'function') {
      throw new Error(
        'This browser cannot pick a Drive or Dropbox folder. Use the Android app, or set a ranch server if you run Docker.',
      );
    }
    const handle = await picker.showDirectoryPicker({ mode: 'readwrite' });
    await saveWebHandle(handle);
    return { id: WEB_FOLDER_ID, name: handle.name || 'Shared folder' };
  }

  private async root(folderId: string): Promise<FileSystemDirectoryHandle> {
    const handle = folderId === WEB_FOLDER_ID ? await loadWebHandle() : await loadWebHandle();
    if (!handle) {
      throw new Error('Choose a shared folder in Settings.');
    }
    if (!(await queryPermission(handle))) {
      throw new Error('Allow folder access when the browser asks, then try again.');
    }
    return handle;
  }

  async writeFile(options: { folderId: string; path: string; data: string }): Promise<void> {
    const root = await this.root(options.folderId);
    const parts = options.path.split('/').filter((part) => part && part !== '.');
    const name = parts.pop();
    if (!name) throw new Error('Missing file path.');
    const parent = (await dirAt(root, parts.join('/'), true))!;
    const file = await parent.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(options.data);
    await writable.close();
  }

  async readFile(options: {
    folderId: string;
    path: string;
  }): Promise<{ data?: string; missing?: boolean }> {
    const root = await this.root(options.folderId);
    const parts = options.path.split('/').filter((part) => part && part !== '.');
    const name = parts.pop();
    if (!name) return { missing: true };
    const parent = await dirAt(root, parts.join('/'), false);
    if (!parent) return { missing: true };
    try {
      const file = await parent.getFileHandle(name);
      const blob = await file.getFile();
      return { data: await blob.text() };
    } catch {
      return { missing: true };
    }
  }

  async mkdir(options: { folderId: string; path: string }): Promise<void> {
    const root = await this.root(options.folderId);
    await dirAt(root, options.path, true);
  }

  async readdir(options: {
    folderId: string;
    path: string;
  }): Promise<{ entries: SharedFolderEntry[] }> {
    const root = await this.root(options.folderId);
    const folder = await dirAt(root, options.path, false);
    if (!folder) return { entries: [] };
    const entries: SharedFolderEntry[] = [];
    for await (const [name, handle] of folder.entries()) {
      entries.push({
        name,
        isDir: handle.kind === 'directory',
      });
    }
    return { entries };
  }

  async exists(options: {
    folderId: string;
    path: string;
  }): Promise<{ exists: boolean; isDirectory: boolean }> {
    const root = await this.root(options.folderId);
    const parts = options.path.split('/').filter((part) => part && part !== '.');
    if (parts.length === 0) return { exists: true, isDirectory: true };
    const name = parts.pop()!;
    const parent = await dirAt(root, parts.join('/'), false);
    if (!parent) return { exists: false, isDirectory: false };
    try {
      await parent.getDirectoryHandle(name);
      return { exists: true, isDirectory: true };
    } catch {
      try {
        await parent.getFileHandle(name);
        return { exists: true, isDirectory: false };
      } catch {
        return { exists: false, isDirectory: false };
      }
    }
  }
}

export const SharedFolder = registerPlugin<SharedFolderApi>('SharedFolder', {
  web: () => Promise.resolve(new SharedFolderWeb()),
});
