import { Capacitor } from '@capacitor/core';

/** True when the UI is running inside the Android APK, not a browser. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Example ranch API URL shown in Settings. Each install types its own host. */
export const RANCH_LAN_API_PLACEHOLDER = 'http://YOUR-NAS:8180/api';
