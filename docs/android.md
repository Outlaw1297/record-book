# Android APK (offline field app)

The Portainer site is a browser app. This APK **embeds the record book on the phone**, so calf logging works with airplane mode, dead cell service, or the NAS powered off. IndexedDB stays on the device.

Not every install has a ranch server. Sign in with Google or Dropbox on the phone to share the book. If this ranch does run Docker, the APK uses that Postgres database when it can reach it on ranch Wi-Fi.

A PWA “Add to Home Screen” shortcut still needs the website the first time, and HTTP on the LAN is not a secure context, so service-worker offline is unreliable there. Use the APK in the pasture.

## Install on a phone

1. Wait for the **Android APK** GitHub Action on `main` (or download the [android-debug release](https://github.com/Outlaw1297/record-book/releases/tag/android-debug)).
2. Download `record-book-debug.apk`.
3. Copy it to the phone (Drive, USB, or open the GitHub release in Chrome on the phone).
4. Open the APK. Android will ask you to allow that app (Chrome, Files, etc.) to install unknown apps. Allow it for this one install.
5. Open **Record Book**. Finish onboarding. Log calves. No website required.

This is a **debug** APK for ranch sideload, not a Play Store build. Uninstall the old app first if a previous build used a different signing key.

## Google / Dropbox from the APK

Tap **Sign in with Google** or **Sign in with Dropbox**. That is native platform login. It does not call the ranch API.

Client IDs are baked from GitHub secrets `VITE_GOOGLE_CLIENT_ID` and `VITE_DROPBOX_APP_KEY`. You do not paste them on the phone.

Google Cloud also needs an **Android** OAuth client for package `me.flyingjranch.recordbook` with this debug SHA-1:

```text
CB:80:C1:B3:7A:DA:5E:5D:FE:9D:7B:0B:66:C1:0F:03:D9:76:11:BE
```

Dropbox needs the redirect URI `me.flyingjranch.recordbook://oauth/callback`.

See [sync setup](sync-setup.md).

## Ranch database from the phone (optional)

The APK does **not** bake `/api`. That path only works inside the Portainer nginx site.

The phone does **not** assume every install is this NAS. On launch it probes `http://192.168.1.56:8180/api/health`. If that answers `{"ok":true}`, Settings gets that ranch URL. If it does not, the phone stays on Google/Dropbox only.

To check from Chrome, open `http://192.168.1.56:8180/api/health`. Change the URL in Settings only if this ranch’s NAS IP is different.

## Build locally

Needs Node 22+ and the Android SDK.

```bash
cd app
npm install
npm run cap:sync
cd android && ./gradlew assembleDebug
```

APK path: `app/android/app/build/outputs/apk/debug/app-debug.apk`.
