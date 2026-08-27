# Android APK (offline field app)

The Portainer site is a browser app. This APK **embeds the record book on the phone**, so calf logging works with airplane mode, dead cell service, or the NAS powered off. IndexedDB stays on the device. On ranch Wi-Fi it syncs with the Docker Postgres book.

A PWA “Add to Home Screen” shortcut still needs the website the first time, and HTTP on the LAN is not a secure context, so service-worker offline is unreliable there. Use the APK in the pasture.

## Install on a phone

1. Wait for the **Android APK** GitHub Action on `main` (or download the [android-debug release](https://github.com/Outlaw1297/record-book/releases/tag/android-debug)).
2. Download `record-book-debug.apk`.
3. Copy it to the phone (Drive, USB, or open the GitHub release in Chrome on the phone).
4. Open the APK. Android will ask you to allow that app (Chrome, Files, etc.) to install unknown apps. Allow it for this one install.
5. Open **Record Book**. Finish onboarding. Log calves. No website required.

This is a **debug** APK for ranch sideload, not a Play Store build.

## Ranch database from the phone

The APK does **not** bake `/api`. That path only works inside the Portainer nginx site.

On first launch the phone uses `http://192.168.1.56:8180/api`. That address is for the app, not a web page. To check from Chrome, open `http://192.168.1.56:8180/api/health` — it should show `{"ok":true}`. Change the URL in Settings only if the NAS IP is different.

## Google / Dropbox from the APK

Create the Google/Dropbox app once (see [sync setup](sync-setup.md)). In Settings, paste the Google client ID and/or Dropbox app key, tap **Save app IDs**, then **Connect**.

Redirect URI for the APK:

```text
https://localhost/oauth/callback
```

Also register `http://192.168.1.56:8180/oauth/callback` for the office PWA. The Capacitor WebView is a secure `https://localhost` origin.

## Build locally

Needs Node 22+ and the Android SDK.

```bash
cd app
npm install
npm run cap:sync
cd android && ./gradlew assembleDebug
```

APK path: `app/android/app/build/outputs/apk/debug/app-debug.apk`.
