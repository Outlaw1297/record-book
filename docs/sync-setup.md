# Drive / Dropbox sync setup

The record book keeps cattle rows in **this device’s IndexedDB**. Google Drive or Dropbox is only the private mailbox between your phone and the office PC. There is no ranch server, and OAuth tokens never go into the cloud snapshot.

Most of the time you can work with no signal. When the phone finds Wi‑Fi or cell data, it pushes pending outbox files and pulls anything the other device wrote.

## Folder layout

Inside your account the app creates:

```text
RecordBook/
  config.json
  snapshots/herd-latest.json
  changes/<deviceId>/<timestamp>.jsonl
```

Use **one Google or Dropbox account** for the ranch. Anyone with that login can see the folder, so keep it a private account, not a shared public link.

## Redirect URI

Whatever origin you open the app on, add this exact callback:

```text
https://YOUR-ORIGIN/oauth/callback
```

Examples: `http://localhost:5173/oauth/callback`, or your hosted PWA origin plus `/oauth/callback`.

## Google Drive

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (or reuse one).
2. Enable **Google Drive API**.
3. Configure the OAuth consent screen. External is fine; add your Gmail as a test user while the app is in testing.
4. Create credentials → **OAuth client ID** → **Web application**.
5. Authorized JavaScript origins: `http://localhost:5173` (and the production origin).
6. Authorized redirect URIs: `http://localhost:5173/oauth/callback` (and production).
7. Copy the **Client ID** (not a client secret). This is a public PKCE client.
8. In the record book: Settings → **App keys** → paste the client ID → **Connect Google Drive**.

The app requests `drive.file` only: it can see files **it created**, not the rest of your Drive.

## Dropbox

Dropbox PKCE is the simpler carrier if you do not want to stand up Google Cloud.

1. Open [Dropbox App Console](https://www.dropbox.com/developers/apps) → Create app.
2. Scoped access. **App folder** is the most private (files live under `Apps/<app name>/RecordBook`).
3. Permissions: `files.content.read`, `files.content.write`, `files.metadata.read`, `account_info.read`.
4. Redirect URI: `http://localhost:5173/oauth/callback` (and production).
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
- **Online + connected:** a short debounce uploads one JSONL file per device, then refreshes `snapshots/herd-latest.json`.
- **New empty device:** imports the latest snapshot, then applies any change files it has not seen.
- **Two devices edited the same row:** last `updatedAt` wins. Settings → Overlap log.
- **Disconnect:** tokens leave this browser. The herd on the device and the cloud folder both stay.

Hosted deploys must serve the PWA as a single-page app (`/oauth/callback` rewrites to `index.html`).
