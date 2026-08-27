# Android APK (offline field app)

The Portainer site is a browser app. This APK **embeds the record book on the phone**, so calf logging works with airplane mode, dead cell service, or the NAS powered off. IndexedDB stays on the device.

This is the same APK for every ranch. It does not bake a specific NAS address or OAuth keys.

## Install on a phone

1. Wait for the **Android APK** GitHub Action on `main` (or download the [android-debug release](https://github.com/Outlaw1297/record-book/releases/tag/android-debug)).
2. Download `record-book-debug.apk`.
3. Copy it to the phone (Drive, USB, or open the GitHub release in Chrome on the phone).
4. Open the APK. Android will ask you to allow that app (Chrome, Files, etc.) to install unknown apps. Allow it for this one install.
5. Open **Record Book**. Finish onboarding. Log calves. No website required.

This is a **debug** APK for sideload, not a Play Store build.

## Share without a ranch server

Settings → **Choose Google Drive folder** or **Choose Dropbox folder**. The phone opens the Android folder picker. Open Drive or Dropbox (or any folder) and select it. Other phones pick that same folder.

No Google Cloud client ID, Dropbox app key, or GitHub secret is required.

## Ranch database (optional)

The APK does **not** bake `/api`. That path only works inside the Portainer nginx site.

If this install has a Docker NAS, type that API in Settings, for example `http://YOUR-NAS:8180/api`. Check `http://YOUR-NAS:8180/api/health` in a browser; it should show `{"ok":true}`.

## Build locally

Needs Node 22+ and the Android SDK.

```bash
cd app
npm install
npm run cap:sync
cd android && ./gradlew assembleDebug
```

APK path: `app/android/app/build/outputs/apk/debug/app-debug.apk`.
