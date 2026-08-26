import { Capacitor } from '@capacitor/core';

/** True when the UI is running inside the Android APK, not a browser. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Typical ranch LAN URL for the Portainer stack. Paste in Settings on the phone. */
export const RANCH_LAN_API_PLACEHOLDER = 'http://192.168.1.56:8180/api';
