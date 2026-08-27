# Sync setup

The **ranch Docker Postgres database** is the shared book. Each phone and the office keep a local IndexedDB copy for offline work. On ranch Wi-Fi they pull and push through `http://YOUR-HOST:8180/api/`. Google Drive and Dropbox are optional sign-in, not the herd.

See [Docker / Portainer](docker-portainer.md) and [Ranch API](api.md).

## What stays on this device

| Stays on this device | Shared in Postgres |
|----------------------|--------------------|
| Your name | Ranch name and working year |
| Device name (“Dalton’s phone”) | Animals, cow–calf, breeding, pasture, sales |
| Sign-in tokens (if you use Google/Dropbox) | Device roster |

A second phone or the office PC: open the app on ranch Wi-Fi. The next sync joins the existing herd (it does not start a second book). If two people log the same cow while offline, the newer `updatedAt` wins.

**Replace this device from the ranch database** (Settings) wipes unsynced rows on *this* device only and copies Postgres down.

## Google / Dropbox sign-in (optional)

Users only tap **Sign in with Google** or **Sign in with Dropbox**. They never paste keys.

The ranch API holds the OAuth client ID and runs the login. Put these GitHub Actions secrets once (as the app developer), then rebuild images:

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_DROPBOX_APP_KEY`

Or write the same values into the stack files `/keys/google_client_id` and `/keys/dropbox_app_key`.

Register one redirect URI on the Google/Dropbox app:

```text
http://192.168.1.56:8180/api/oauth/callback
```

Authorized JavaScript origins are not required for this server-side flow.

## How sync behaves

- **Offline:** every save writes IndexedDB + an outbox row.
- **Online + ranch API:** pull the Postgres snapshot, merge, push this device’s herd, mark the outbox copied.
- **Optional Google/Dropbox:** after sign-in, the same sync can also write a backup folder. Postgres stays the book.
