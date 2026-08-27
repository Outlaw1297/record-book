# Sync setup

Record Book is a tool any ranch can install. **Each ranch’s cattle stay on that ranch.** One ranch’s Drive, Dropbox, or NAS is never used for another ranch’s herd.

Each phone keeps a local IndexedDB copy for offline work. Then pick one sharing path for **this** ranch only:

1. **This ranch runs Docker / Portainer on its own network.** The website uses `/api` on that host. That Postgres database is this ranch’s book. Other ranches who pull the same Docker image get their own empty database.
2. **This ranch has no server.** On the APK, choose a folder in **this ranch’s** Google Drive, Dropbox, or other storage. Other phones on **this** ranch pick that same folder. Another ranch picks a folder in **their** account.

See [Docker / Portainer](docker-portainer.md), [Ranch API](api.md), and [Android APK](android.md).

## What stays on this device

| Stays on this device | Shared in this ranch’s book |
|----------------------|-----------------------------|
| Your name | Ranch name and working year |
| Device name (“Alex’s phone”) | Animals, cow–calf, breeding, pasture, sales |
| Folder permission / ranch API URL | Device roster for this ranch |

## This ranch’s folder (no server)

Settings → **Use my Google Drive folder** or **Use my Dropbox folder**. Android opens the system picker on **your** account. Pick a folder you own. The app writes a `RecordBook` directory inside it.

That folder is this ranch only. Do not pick a folder that belongs to another ranch.

Desktop Chrome over HTTPS can pick a folder the same way. HTTP LAN Docker sites use this ranch’s database instead.

## This ranch’s server (optional)

Only if **you** run the Portainer stack on **your** network. In the APK, type **your** host’s API, for example `http://YOUR-NAS:8180/api`. Do not type another ranch’s address.

The Docker website already uses `/api` on whatever host you deployed. Health check: `http://YOUR-NAS:8180/api/health` should show `{"ok":true}`.

## How sync behaves

- **Offline:** every save writes IndexedDB + an outbox row.
- **Online + this ranch’s API set:** pull/push this ranch’s Postgres.
- **Online + no server + this ranch’s folder:** that folder is this ranch’s book.
- **Online + neither:** Settings asks you to choose this ranch’s folder or this ranch’s API.
