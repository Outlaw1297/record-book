# Drive / Dropbox sync setup

The record book keeps cattle rows in **this device’s IndexedDB**. Google Drive or Dropbox is the private shared database for every phone, tablet, and office PC. OAuth tokens never go into the cloud snapshot.

An optional **ranch Postgres** (Docker / Portainer) is a second copy of the same herd so another app can call a REST API. It does not replace Drive or Dropbox. See [Docker / Portainer](docker-portainer.md) and [Ranch API](api.md).

Most of the time you can work with no signal. When a device finds Wi‑Fi or cell data, it pushes pending outbox files and pulls anything the other devices wrote.

## Multiple devices and users

Sign **every** device into the **same** ranch Google or Dropbox account. That is what makes it one database:

| Stays on this device | Shared across the book |
|----------------------|------------------------|
| Your name | Ranch name and working year |
| Device name (“Dalton’s phone”) | Animals, cow–calf, breeding, pasture, sales |
| OAuth tokens | `RecordBook` folder on Drive/Dropbox |

A second phone or the office PC: install the PWA, finish onboarding with *your* name, then Connect using that same cloud account. The first sync joins the existing book (it does not start a second herd). If two people log the same cow or calf while offline, the app merges by herd I.D. / year and keeps the newer row.

**Replace this device from the shared book** (Settings) wipes unsynced rows on *this* device only and copies the cloud herd down. Use it when a new office PC should match the phone, not the other way around.

Do not connect two personal Dropbox/Google logins and expect them to see each other. App-folder Dropbox is per account. One ranch login, many devices.

## Folder layout

Inside your account the app creates:

```text
RecordBook/
  config.json                 # bookId for this shared herd
  devices.json                # phones, office PCs, last seen
  snapshots/herd-latest.json
  changes/<deviceId>/<timestamp>.jsonl
```

Use **one Google or Dropbox account** for the ranch. Anyone with that login can see the folder, so keep it a private account, not a shared public link.

## Redirect URI

Whatever origin you open the app on, add this exact callback:

```text
https://YOUR-ORIGIN/oauth/callback
```

Examples: `http://localhost:5173/oauth/callback`, the hosted PWA origin plus `/oauth/callback`. For the Android APK add the WebView JavaScript origin `https://localhost` and this redirect URI:

```text
http://127.0.0.1:18763/oauth/callback
```

Login on the phone runs in Chrome Custom Tabs and returns through that loopback address. See [Android APK](android.md).

## Google Drive

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (or reuse one).
2. Enable **Google Drive API**.
3. Configure the OAuth consent screen. External is fine; add your Gmail as a test user while the app is in testing.
4. Create credentials → **OAuth client ID** → **Web application**.
5. Authorized JavaScript origins: `http://localhost:5173`, the production PWA origin, and `https://localhost` (Android APK WebView).
6. Authorized redirect URIs: each web origin plus `/oauth/callback`, and `http://127.0.0.1:18763/oauth/callback` for the APK.
7. Copy the **Client ID** (not a client secret). This is a public PKCE client.
8. In the record book: Settings → **App keys** → paste the client ID → **Connect Google Drive**.

The app requests `drive.file` only: it can see files **it created**, not the rest of your Drive.

## Dropbox

Dropbox PKCE is the simpler carrier if you do not want to stand up Google Cloud.

1. Open [Dropbox App Console](https://www.dropbox.com/developers/apps) → Create app.
2. Scoped access. **App folder** is the most private (files live under `Apps/<app name>/RecordBook`).
3. Permissions: `files.content.read`, `files.content.write`, `files.metadata.read`, `account_info.read`.
4. Redirect URI: `http://localhost:5173/oauth/callback`, the production PWA callback, and `http://127.0.0.1:18763/oauth/callback` (Android APK).
5. Copy the **App key**.
6. In the record book: Settings → **App keys** → paste the app key → **Connect Dropbox**.

## Optional env files

You can bake keys into a local build instead of pasting them:

```bash
cp app/.env.example app/.env.local
```

```env
VITE_GOOGLE_CLIENT_ID=....apps.googleusercontent.com
VITE_DROPBOX_APP_KEY=your_dropbox_app_key
```

`.env.local` is gitignored. Device Settings can still override the paste fields.

## How sync behaves

- **Offline:** every save writes IndexedDB + an outbox row. Nothing waits on the network.
- **Online + Drive/Dropbox:** a short debounce uploads one JSONL file per device, merges the latest snapshot, then refreshes `snapshots/herd-latest.json` and `devices.json`.
- **Online + ranch API:** the same sync copies a full herd snapshot into Postgres. Future apps read that copy.
- **New device:** adopts the shared ranch name/year, merges the snapshot, then applies change files it has not seen.
- **Same cow logged twice:** merged by herd I.D. (and calf/year where it is obvious). Last `updatedAt` wins. Settings → Overlap log.
- **Disconnect:** tokens leave this browser. The herd on the device and the cloud folder both stay.

Hosted deploys must serve the PWA as a single-page app (`/oauth/callback` rewrites to `index.html`).
