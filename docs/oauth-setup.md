# Native Google Drive and Dropbox login

The Android **file picker** cannot open Drive or Dropbox on many phones. Those apps often do not show up under “Open from.” Record Book therefore signs in with the **official native OAuth flows**, then writes a `RecordBook` folder in **that ranch’s** account.

This is not a shared product Drive or Dropbox. Each ranch signs into **their** Google or Dropbox. The OAuth client IDs only identify Record Book as the app.

## Official docs

### Google (Android installed app)

Google’s installed-app flow is **not** a folder picker. Custom URI schemes are not used for Google on Android.

- [OAuth 2.0 for iOS & Desktop / installed apps](https://developers.google.com/identity/protocols/oauth2/native-app) — PKCE, system browser, no client secret
- [Authorize access to Google user data on Android](https://developer.android.com/identity/authorization) — Credential Manager to pick the account, then `AuthorizationClient.authorize()` for Drive. Create **both** an Android client (package + SHA-1) and a Web client (used as `webClientId`)
- [Choose Google Drive API scopes](https://developers.google.com/drive/api/guides/about-auth) — use `https://www.googleapis.com/auth/drive.file` (files this app creates)
- [Capgo Google Login on Android](https://capgo.app/docs/plugins/social-login/google/android/) — this APK’s plugin. Drive scopes require a modified `MainActivity` that forwards `AuthorizationClient` results

You need **two** OAuth client IDs in the **same** Google Cloud project:

| Client type | Used for | Where it goes |
|-------------|----------|---------------|
| **Web application** | Access-token audience / `webClientId` | GitHub secret `VITE_GOOGLE_CLIENT_ID` |
| **Android** (package + SHA-1) | Proves this APK may call Google | Google Cloud Console only. Do **not** put this ID in the app |

A common failure is using the Android client ID as `webClientId`. Credential Manager requires the **Web** client ID.

### Dropbox (native app / PKCE)

- [Dropbox OAuth Guide](https://developers.dropbox.com/oauth-guide) — mobile apps must use **authorization code + PKCE** (no app secret in the APK). Offline access needs `token_access_type=offline` so a refresh token is returned
- [Dropbox HTTP /oauth2/authorize](https://www.dropbox.com/developers/documentation/http/documentation#oauth2-authorize)
- [Dropbox Java SDK Android Auth](https://github.com/dropbox/dropbox-sdk-java) — Custom Tabs or the Dropbox app; redirect `db-{appKey}` or a registered custom scheme
- [Capgo generic OAuth2](https://capgo.app/docs/plugins/social-login/oauth2/) — Custom Tabs + PKCE. This APK returns to `me.flyingjranch.recordbook://oauth/callback`

Do not tell each ranch to create their own Dropbox app. Register Record Book once. Each user signs into **their** Dropbox.

## What the APK actually does

`@capgo/capacitor-social-login`:

1. **Google:** Credential Manager signs the ranch in, then `AuthorizationClient` requests `drive.file`. Access tokens stay on the phone. `MainActivity` implements `ModifiedMainActivityForSocialLoginPlugin` so those extra scopes are allowed.
2. **Dropbox:** Chrome Custom Tabs open Dropbox OAuth with PKCE and `token_access_type=offline`, then return to `me.flyingjranch.recordbook://oauth/callback`.

## Create the Record Book OAuth apps once

Do this once for the product. Do not ask each ranch to create their own Google Cloud project.

### Google

1. Open [Google Cloud Console → APIs](https://console.cloud.google.com/apis/library) and enable **Google Drive API**.
2. [OAuth consent screen](https://console.cloud.google.com/auth/overview): External, app name Record Book. Add yourself as a test user while it is in Testing. Declare the `drive.file` scope.
3. [Credentials](https://console.cloud.google.com/apis/credentials):
   - **Web application** client. Copy the client ID. That is `VITE_GOOGLE_CLIENT_ID`.
   - **Android** client. Package name `me.flyingjranch.recordbook`. SHA-1 of this debug APK:

     `CB:80:C1:B3:7A:DA:5E:5D:FE:9D:7B:0B:66:C1:0F:03:D9:76:11:BE`

     Do not put the Android client ID in the app. Google matches the APK by package + SHA-1.

Google Cloud changes can take a few hours to propagate. If the consent screen is Testing, every Google account that signs in must be a test user.

### Dropbox

1. Open [Dropbox App Console](https://www.dropbox.com/developers/apps) → Create app.
2. Scoped app, **App folder** (API path `/RecordBook` lives inside the app folder) or Full Dropbox. Permissions: `files.content.read`, `files.content.write`, `files.metadata.read`, `files.metadata.write`.
3. Enable PKCE. Redirect URI: `me.flyingjranch.recordbook://oauth/callback`
4. Copy the **App key**. That is `VITE_DROPBOX_APP_KEY`. Do not put the app secret in the APK.

## Bake the public IDs into the APK

GitHub repo secrets (these are public OAuth client IDs, not farm data):

- `VITE_GOOGLE_CLIENT_ID` — the **Web** client ID, ending in `.apps.googleusercontent.com`
- `VITE_DROPBOX_APP_KEY`

Then rebuild **Android APK** on `main`. Until those secrets exist, Sign in with Google / Dropbox tells you they are not baked yet.

## On the phone

Settings → **Sign in with Google** or **Sign in with Dropbox**. Android opens Google or Dropbox login for **your** account. The herd copies into a RecordBook folder there. Another ranch signs into **their** account.
