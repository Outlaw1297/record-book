# Sync setup

Each phone keeps a local IndexedDB copy for offline work. **How they share depends on the install:**

1. **This ranch (Flying J) has the Docker server.** On ranch Wi-Fi, phones pull and push Postgres at `http://YOUR-HOST:8180/api/`. That database is the shared book.
2. **Other installs may only have the APK or PWA.** Those phones sign in with Google or Dropbox on the device. Drive/Dropbox is then the shared book. No ranch API is required for login or sync.

See [Docker / Portainer](docker-portainer.md), [Ranch API](api.md), and [Android APK](android.md).

## What stays on this device

| Stays on this device | Shared in the book |
|----------------------|--------------------|
| Your name | Ranch name and working year |
| Device name (“Dalton’s phone”) | Animals, cow–calf, breeding, pasture, sales |
| Sign-in tokens | Device roster |
| Ranch API URL / key (if you have a server) | |

A second phone or the office PC: either open the app on ranch Wi-Fi (server install) or sign in with the same Google/Dropbox account (no-server install). If two people log the same cow while offline, the newer `updatedAt` wins.

## Google / Dropbox sign-in (native, no ranch required)

Users only tap **Sign in with Google** or **Sign in with Dropbox**. They never paste keys.

The app talks to Google and Dropbox directly:

- **Android APK:** Google Sign-In (Drive `drive.file` scope) and Dropbox in Chrome Custom Tabs, returning to `me.flyingjranch.recordbook://oauth/callback`.
- **Browser / PWA:** in-app PKCE, returning to `{origin}/oauth/callback`.

Client IDs are baked at build time from GitHub Actions secrets (not stored on the phone as Settings fields):

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_DROPBOX_APP_KEY`

If this ranch also runs Docker, the NAS can still expose those public IDs at `/api/oauth-clients` so a phone on ranch Wi-Fi can pick them up. That is optional. Login must work when the NAS is absent.

### Google Cloud Console

1. Enable the **Google Drive API**.
2. Create an OAuth **Web** client. Put its ID in `VITE_GOOGLE_CLIENT_ID`.
3. Create an OAuth **Android** client:
   - Package: `me.flyingjranch.recordbook`
   - SHA-1 of the sideload debug keystore: `CB:80:C1:B3:7A:DA:5E:5D:FE:9D:7B:0B:66:C1:0F:03:D9:76:11:BE`
4. Authorized redirect URIs for the Web client (PWA / office browser):

```text
http://192.168.1.56:8180/oauth/callback
http://localhost:5173/oauth/callback
```

### Dropbox app

Redirect URIs:

```text
me.flyingjranch.recordbook://oauth/callback
http://192.168.1.56:8180/oauth/callback
http://localhost:5173/oauth/callback
```

## How sync behaves

- **Offline:** every save writes IndexedDB + an outbox row.
- **Online + ranch API reachable:** pull the Postgres snapshot, merge, push this device’s herd. Google/Dropbox is an extra copy if signed in.
- **Online + no ranch (or ranch unreachable) + signed in:** Google Drive or Dropbox is the shared book.
- **Online + neither:** Settings asks you to sign in, or to set a ranch API if you have a server.
