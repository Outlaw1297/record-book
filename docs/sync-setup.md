# Sync setup

Each phone keeps a local IndexedDB copy for offline work. Sharing is the same for every ranch:

1. **This install runs Docker / Portainer.** The PWA uses `/api` on that host. Postgres is the shared book. No Google or Dropbox keys.
2. **This install is only the APK (or a browser without Docker).** Choose a shared folder on the device. The system picker can open **Google Drive**, **Dropbox**, USB, or any folder. Every phone picks the same folder. No keys to paste, no GitHub secrets, no Google Cloud console.

See [Docker / Portainer](docker-portainer.md), [Ranch API](api.md), and [Android APK](android.md).

## What stays on this device

| Stays on this device | Shared in the book |
|----------------------|--------------------|
| Your name | Ranch name and working year |
| Device name (“Dalton’s phone”) | Animals, cow–calf, breeding, pasture, sales |
| Folder permission / ranch API URL | Device roster |

## Shared folder (APK, no ranch server)

Settings → **Choose Google Drive folder** or **Choose Dropbox folder**. Android opens the system folder picker. Open Drive or Dropbox there (or any folder) and pick it. Create a `RecordBook` folder if you want; the app also creates one inside the folder you pick.

The same picker works on a desktop Chrome PWA over HTTPS. It does not work on HTTP LAN pages; those Docker sites use the ranch database instead.

## Ranch server (optional)

Only if this install runs the Portainer stack. In the APK, type that host’s API, for example `http://YOUR-NAS:8180/api`. The Docker website already uses `/api`. Health check: `http://YOUR-NAS:8180/api/health` should show `{"ok":true}`.

## How sync behaves

- **Offline:** every save writes IndexedDB + an outbox row.
- **Online + ranch API set:** pull/push Postgres. A shared folder is an extra copy if one is chosen.
- **Online + no ranch + shared folder:** that folder is the book.
- **Online + neither:** Settings asks you to choose a folder or set a ranch API.
