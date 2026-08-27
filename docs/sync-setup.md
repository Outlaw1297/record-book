# Sync setup

Record Book is a tool any ranch can install. **Each ranch’s cattle stay on that ranch.** One ranch’s Drive, Dropbox, or NAS is never used for another ranch’s herd.

Each phone keeps a local IndexedDB copy for offline work. Then pick one sharing path for **this** ranch only:

1. **This ranch runs Docker / Portainer on its own network.** The website uses `/api` on that host. That Postgres database is this ranch’s book. Other ranches who pull the same Docker image get their own empty database.
2. **This ranch has no server.** On the APK, **Sign in with Google** or **Sign in with Dropbox** using **this ranch’s** account. Other phones on this ranch sign into the same account. Another ranch signs into theirs.

See [Docker / Portainer](docker-portainer.md), [Ranch API](api.md), and [Android APK](android.md).

## What stays on this device

| Stays on this device | Shared in this ranch’s book |
|----------------------|-----------------------------|
| Your name | Ranch name and working year |
| Device name (“Alex’s phone”) | Animals, cow–calf, breeding, pasture, sales |
| Drive / Dropbox tokens / ranch API URL | Device roster for this ranch |

## This ranch’s Google Drive or Dropbox (no server)

Settings → **Sign in with Google** or **Sign in with Dropbox**. That is native OAuth into **your** account. Setup: [Native login](oauth-setup.md).

HTTP LAN Docker sites use this ranch’s database instead.

## This ranch’s server (optional)

Only if **you** run the Portainer stack on **your** network. In the APK, type **your** host’s API, for example `http://YOUR-NAS:8180/api`. Do not type another ranch’s address.

The Docker website already uses `/api` on whatever host you deployed. Health check: `http://YOUR-NAS:8180/api/health` should show `{"ok":true}`.

## How sync behaves

- **Offline:** every save writes IndexedDB + an outbox row.
- **Online + this ranch’s API set:** pull/push this ranch’s Postgres by itself (save, every few seconds, and when the app opens). Tap Sync if you want it right now.
- **Online + no server + signed in:** YOUR Google Drive or Dropbox is this ranch’s book.
- **Online + neither:** Settings asks you to sign in or set this ranch’s API.
