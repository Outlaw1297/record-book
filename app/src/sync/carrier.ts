import { GoogleDriveCarrier } from './googleDrive';
import { DropboxCarrier } from './dropbox';
import type { CloudCarrier, CloudProvider } from './types';

export function carrierFor(provider: CloudProvider): CloudCarrier {
  return provider === 'google-drive'
    ? new GoogleDriveCarrier()
    : new DropboxCarrier();
}
