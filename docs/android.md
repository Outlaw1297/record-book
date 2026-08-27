# Android APK (offline field app)

The Portainer site is a browser app. This APK **embeds the record book on the phone**, so calf logging works with airplane mode, dead cell service, or the NAS powered off. IndexedDB stays on the device.

This is the same APK for every ranch. It does not bake a NAS address or anyone else’s Drive or Dropbox. Public OAuth client IDs identify the Record Book app, not a ranch. Each install is another ranch using the tool. Cattle stay on that ranch.

## Install on a phone

1. Wait for the **Android APK** GitHub Action on `main` (or download the [android-debug release](https://github.com/Outlaw1297/record-book/releases/tag/android-debug)).
2. Download `record-book-debug.apk`.
3. Copy it to the phone (Drive, USB, or open the GitHub release in Chrome on the phone).
4. Open the APK. Android will ask you to allow that app (Chrome, Files, etc.) to install unknown apps. Allow it for this one install.
5. Open **Record Book**. Finish onboarding. Log calves. No website required.

This is a **debug** APK for sideload, not a Play Store build.

## Share without a ranch server

Settings → **Sign in with Google** or **Sign in with Dropbox**. That opens Google or Dropbox login for **your** account (not this phone’s file picker). The app writes `RecordBook` in that account.

See [Native Google Drive and Dropbox login](oauth-setup.md) for the official OAuth docs and how to bake the public client IDs once.

## Ranch database (optional)

The APK does **not** bake `/api`. That path only works inside a Portainer site **you** run.

If **you** run Docker on **your** network, type **your** API in Settings, for example `http://YOUR-NAS:8180/api`. Do not type another ranch’s address. Check `http://YOUR-NAS:8180/api/health` in a browser; it should show `{"ok":true}`.

## Build locally

Needs Node 22+ and the Android SDK.

```bash
cd app
npm install
npm run cap:sync
cd android && ./gradlew assembleDebug
```

APK path: `app/android/app/build/outputs/apk/debug/app-debug.apk`.
