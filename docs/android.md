# Android APK (offline field app)

The Portainer site is a browser app. This APK **embeds the record book on the phone**, so calf logging works with airplane mode, dead cell service, or the NAS powered off. IndexedDB stays on the device. Drive, Dropbox, and the ranch API are used only when you have signal.

A PWA “Add to Home Screen” shortcut still needs the website the first time, and HTTP on the LAN is not a secure context, so service-worker offline is unreliable there. Use the APK in the pasture.

## Install on a phone

1. Wait for the **Android APK** GitHub Action on `main` (or download the [android-debug release](https://github.com/Outlaw1297/record-book/releases/tag/android-debug)).
2. Download `record-book-debug.apk`.
3. Copy it to the phone (Drive, USB, or open the GitHub release in Chrome on the phone).
4. Open the APK. Android will ask you to allow that app (Chrome, Files, etc.) to install unknown apps. Allow it for this one install.
5. Open **Record Book**. Finish onboarding. Log calves. No website required.

This is a **debug** APK for ranch sideload, not a Play Store build. It is signed with the repo `debug.keystore`, so a newer GitHub APK installs over the previous one without wiping IndexedDB.

## Ranch database from the phone

The APK does **not** bake `/api`. That path only works inside the Portainer nginx site.

On ranch Wi-Fi, Settings → Ranch API URL:

```text
http://192.168.1.56:8180/api
```

Then **Copy herd to ranch database**. Change the host if the NAS IP is different.

## Drive / Dropbox from the APK

Login opens in Chrome Custom Tabs. Google blocks OAuth inside the app WebView (`403 disallowed_useragent`).

Add this JavaScript origin (Google):

```text
https://localhost
```

And this redirect URI (Google and Dropbox):

```text
http://127.0.0.1:18763/oauth/callback
```

The Capacitor WebView origin is still `https://localhost`. The loopback redirect is how Chrome hands the login code back to the APK. Paste the same client ID / app key you use on the office PWA.

## Build locally

Needs Node 22+ and the Android SDK.

```bash
cd app
npm install
npm run cap:sync
cd android && ./gradlew assembleDebug
```

APK path: `app/android/app/build/outputs/apk/debug/app-debug.apk`.
