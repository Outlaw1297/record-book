# Sync setup

Record Book is a tool any ranch can install. **Each ranch’s cattle stay on that ranch.** One ranch’s Drive, Dropbox, or NAS is never used for another ranch’s herd.

Each phone keeps a local IndexedDB copy for offline work.

1. **This ranch runs Docker / Portainer.** That Postgres database is this ranch’s book. Other ranches who pull the same image get their own empty database.
2. **Spare copy (recommended with Docker).** On the APK, also **Sign in with Google** or **Sign in with Dropbox** using **this ranch’s** account. After the phone copies the ranch database, it writes a spare `RecordBook` folder in that account. If the NAS is off, the phone uses that copy. Another ranch signs into theirs.
3. **This ranch has no server.** Drive or Dropbox is the book (same sign-in).

See [Docker / Portainer](docker-portainer.md), [Ranch API](api.md), and [Android APK](android.md).

## What stays on this device

| Stays on this device | Shared in this ranch’s book |
|----------------------|-----------------------------|
| Your name | Ranch name and working year |
| Device name (“Alex’s phone”) | Animals, cow–calf, breeding, pasture, sales |
| Drive / Dropbox tokens / ranch API URL | Device roster for this ranch |

## This ranch’s Google Drive or Dropbox

Settings on the **phone** → **Sign in with Google** or **Sign in with Dropbox**. That is native OAuth into **your** account. First-time setup (once, on a computer): [click-by-click walkthrough](oauth-setup.md).

- **No Docker:** that account is this ranch’s book.
- **With Docker:** those accounts are spare copies of the ranch database. You can sign into Google, Dropbox, or both. The Portainer website cannot sign in to Google on `http://NAS` (Google blocks that). Use the APK.

## This ranch’s server (optional)

Only if **you** run the Portainer stack on **your** network. In the APK, type **your** host’s API, for example `http://YOUR-NAS:8180/api`. Do not type another ranch’s address.

The Docker website already uses `/api` on whatever host you deployed. Health check: `http://YOUR-NAS:8180/api/health` should show `{"ok":true}`.

## How sync behaves

- **Offline:** every save writes IndexedDB + an outbox row.
- **Online + this ranch’s API set:** pull/push this ranch’s Postgres (the book).
- **Online + ranch API + signed in:** same ranch copy, then overwrite the spare Drive/Dropbox snapshot. Does not pull Drive over the ranch book while the NAS is up.
- **Online + ranch API down + signed in:** Drive or Dropbox is the book until the NAS is back.
- **Online + no server + signed in:** YOUR Google Drive or Dropbox is this ranch’s book.
- **Online + neither:** Settings asks you to sign in or set this ranch’s API.
