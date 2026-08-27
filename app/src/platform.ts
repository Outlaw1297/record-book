import { Capacitor } from '@capacitor/core';

/** True when the UI is running inside the Android APK, not a browser. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Typical Flying J ranch LAN URL. The APK probes this; it is not forced on every install. */
export const RANCH_LAN_API_PLACEHOLDER = 'http://192.168.1.56:8180/api';
