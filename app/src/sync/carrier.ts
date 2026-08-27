import { SharedFolderCarrier } from './sharedFolder';
import type { CloudCarrier, CloudProvider } from './types';

export function carrierFor(_provider: CloudProvider): CloudCarrier {
  return new SharedFolderCarrier();
}
