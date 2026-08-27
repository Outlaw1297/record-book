import type { CloudProvider } from './types';

export function folderIsOnThisPhone(folderId: string): boolean {
  const id = folderId.toLowerCase();
  return (
    id.includes('com.android.externalstorage') ||
    id.includes('com.android.providers.downloads') ||
    id.includes('com.sec.android.app.myfiles') ||
    id.includes('com.samsung.android.app.myfiles') ||
    id.includes('com.android.providers.media')
  );
}

export function folderLooksLikeProvider(
  folderId: string,
  provider: CloudProvider,
): boolean {
  const id = folderId.toLowerCase();
  if (provider === 'google-drive') {
    return id.includes('com.google.android.apps.docs');
  }
  if (provider === 'dropbox') {
    return id.includes('dropbox');
  }
  return true;
}

export function localPhoneFolderError(provider: CloudProvider): string {
  if (provider === 'dropbox') {
    return 'Dropbox on Android does not let other apps pick a folder. Use Google Drive (install the Drive app), or set this ranch’s API if you run Docker.';
  }
  return 'That folder is on this phone, not Google Drive. Install the Google Drive app, open the picker menu, and choose Google Drive.';
}

export function assertCloudFolder(folderId: string, provider: CloudProvider): void {
  if (!folderId.startsWith('content:')) return;
  if (folderIsOnThisPhone(folderId) || !folderLooksLikeProvider(folderId, provider)) {
    throw new Error(localPhoneFolderError(provider));
  }
}
