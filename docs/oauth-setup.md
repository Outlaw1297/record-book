# Sign in with Google and Dropbox — click-by-click

You only do this **once**, on a computer, as the person who publishes Record Book. After that, every ranch signs into **their own** Google or Dropbox. These IDs identify the Record Book **app**, not a ranch’s cattle.

You need a Google account, a Dropbox account, and owner access to [github.com/Outlaw1297/record-book](https://github.com/Outlaw1297/record-book).

Do the four walks in order. Have a notes app or paper ready. You will copy two short strings:

- Google **Web client ID** (ends in `.apps.googleusercontent.com`)
- Dropbox **App key** (a short code, not the App secret)

Do **not** put the Google Android client ID in GitHub. Do **not** put the Dropbox App secret anywhere in the app.

---

## Walkthrough 1 — Google Cloud (Drive login)

Official pages: [Create a project](https://developers.google.com/workspace/guides/create-project), [OAuth consent](https://developers.google.com/workspace/guides/configure-oauth-consent), [Android + Web clients](https://developer.android.com/identity/authorization), [Drive scopes](https://developers.google.com/drive/api/guides/about-auth).

### 1A. Make a project

1. On a computer, open [console.cloud.google.com](https://console.cloud.google.com/) and sign in with **your** Google account.
2. If Google asks you to accept terms, accept them.
3. At the top of the page, click the project name (or **Select a project**).
4. Click **New project**.
5. Project name: `Record Book`
6. Click **Create**. Wait until the top bar shows **Record Book**.

You do **not** need to turn on billing for this.

### 1B. Turn on the Drive API

1. Open [this Drive API page](https://console.cloud.google.com/apis/library/drive.googleapis.com) (it should still be in the Record Book project).
2. Click **Enable**. If it already says **Manage**, you are done.

### 1C. Register the app (consent screen)

Google will not let you create login IDs until this is filled in.

1. Open [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding).
2. If you see **Google Auth platform not configured yet**, click **Get started**.
3. **App name:** `Record Book`
4. **User support email:** pick your Gmail from the list.
5. Click **Next**.
6. **Audience:** click **External** (people who are not in a Google Workspace company). Click **Next**. A later grey **Make internal** is normal on a personal Gmail. Leave it External.
7. **Contact information:** type the same email again. Click **Next**.
8. Check **I agree to the Google API Services: User Data Policy**. Click **Continue**, then **Create**.

On Branding, leave **App home page**, **Privacy policy**, **Terms of service**, and **Authorized domains** blank.

If you see the gray box that says a domain “must be pre-registered here” and to check **Google Search Console**, skip it. That text only applies if you type a website (because you are Publishing). Record Book is a phone app. You do **not** register a domain and you do **not** open Search Console.

### 1D. Add yourself as a test user

Adding a Gmail here does **not** put that ranch on your Drive. Google is only allowing that account to see the Allow screen and connect **their** Drive. You still cannot see their cattle.

Google has two modes. Record Book is meant to be universal (unknown ranches, their own Google). That is **later**. Tonight is **Testing**:

| Mode | Who can tap Sign in with Google | What you type |
|------|----------------------------------|---------------|
| **Testing** (now) | Only Gmails you add. Max 100. | **Your** Gmail, so *your* phone works. Not future ranches. |
| **In production** (later) | Any Google account. Same APK. They sign into **theirs**. | Homepage + privacy policy website, then Google’s review. That is when Search Console / Authorized domains matter. |

Do **not** add people you do not know. You will never know every ranch. Dropbox’s equivalent of “any user” is **Enable additional users**. Google’s equivalent is **Publish**, which needs a real website. Skip Publish until Drive works on your phone.

While the app is in Testing, Google only lets listed accounts sign in. Add **your** Gmail.

1. Open [Google Auth Platform → Audience](https://console.cloud.google.com/auth/audience).
2. Publishing status should say **Testing**. Grey **Publish app** is what we want. If the tooltip says you need a homepage URL and privacy policy URL “for switching the app to external production mode”, do **not** add those URLs. That list is only to Publish. Stay in Testing.
3. **User type** should say **External**. Grey **Make internal** (“Because you're not a Google Workspace user…”) is expected on a personal Gmail. Do not try to change it. This still means each ranch signs into **their** Google, not yours.
4. If a yellow box says **Your app's OAuth configuration is incomplete** with **Go to Branding**:
   1. Click **Go to Branding**.
   2. **App name:** `Record Book`
   3. **User support email:** pick your Gmail.
   4. **Developer contact information:** the same email.
   5. Click **Save**. Leave home page, privacy, terms, and Authorized domains blank (same as 1C).
   6. Come back to [Audience](https://console.cloud.google.com/auth/audience).
5. Under **Test users**, click **Add users**.
6. Type the **same Gmail that is on the phone**. Click **Save**.
7. The table must show that Gmail. **No rows to display** means Drive login will fail.
8. If anyone else on this ranch will test Google login, add their Gmail the same way.

You do **not** need **Publish app**. Google’s own exception is: a small app in **Testing**, used by people you add as test users, does **not** go through verification. [Sensitive scope verification — exceptions](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification#exceptions-to-verification-requirements)

Do not Publish tonight. Publishing without a homepage and privacy policy is what that grey button is blocking, and a half-finished Publish is how unknown Gmails get **403 Access blocked**. The 100-user cap on Audience is Google’s Testing lock, not Record Book sharing cattle. After your phone works, unknown ranches need the production walk (website + Publish), not more test-user rows.

### 1E. Tell Google you only need this app’s Drive files

1. Open [Google Auth Platform → Data Access](https://console.cloud.google.com/auth/scopes).
2. Click **Add or remove scopes**.
3. In the filter box, paste:

   `https://www.googleapis.com/auth/drive.file`

4. Check that row. It is a **non-sensitive** scope (files Record Book creates). Do **not** check the huge “See, edit, create, and delete all of your Google Drive files” row.
5. Click **Update**, then **Save**.

### 1F. Create the Web client (this is `VITE_GOOGLE_CLIENT_ID`)

Capgo / Google Sign-In on Android needs a **Web** client ID, even though this is a phone app. Using the Android ID here is the usual reason Google login fails.

1. Open [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients).
2. Click **Create client**.
3. **Application type:** **Web application**.
4. **Name:** `Record Book Web`
5. Leave **Authorized JavaScript origins** and **Authorized redirect URIs** empty.
6. Click **Create**.
7. Copy **Client ID** only. It looks like:

   `123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com`

8. Paste that into your notes. Label it **Web client ID**. Close the dialog.
9. Do **not** copy Client secret. The phone never uses it.

### 1G. Create the Android client (stays in Google only)

This proves the sideload APK is allowed to talk to Google. You never paste this ID into GitHub.

1. Still on [Clients](https://console.cloud.google.com/auth/clients), click **Create client** again.
2. **Application type:** **Android**.
3. **Name:** `Record Book Android debug`
4. **Package name:** type this exactly, all lowercase:

   `me.flyingjranch.recordbook`

5. **SHA-1 certificate fingerprint:** paste this exactly (colons included):

   `CB:80:C1:B3:7A:DA:5E:5D:FE:9D:7B:0B:66:C1:0F:03:D9:76:11:BE`

   That fingerprint is for the **debug** APK from this repo. Skip **Verify ownership**.
6. Click **Create**. You can close the dialog. You do **not** need this Client ID for GitHub.

Google can take a few minutes (sometimes a couple of hours) to notice a new Android client.

### Walkthrough 1H — If Google says it needs verification

You do **not** send Record Book through Google’s paid/review verification. Keep it in Testing. Official: [exceptions to verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification#exceptions-to-verification-requirements) (personal use, and apps left in Testing).

This does **not** put other ranches on your Drive. Each person still signs into **their** Gmail. You only add **your** address so Google will show **you** the Allow screen. Unknown ranches are not added here. They wait until the app is Published.

**A. Stay in Testing. Do not Publish.**

1. On a computer, open [Google Auth Platform → Audience](https://console.cloud.google.com/auth/audience).
2. Find **Publishing status**.
3. It must say **Testing**.
4. Grey **Publish app** is fine. The tooltip about homepage URL and privacy policy URL is Google asking you to Publish. Ignore it. Incomplete-branding yellow box is fine. Do not try to un-grey Publish.
5. If it says **In production**, look for **Back to testing** / unpublish. Click that. Confirm. Do **not** click **Publish app**.

**B. Add the Gmail that is on the phone**

1. Still on Audience, under **Test users**, click **Add users**.
2. Type the **same Gmail** you tap on the phone (the account you want Record Book to use). Click **Save**.
3. If the ranch uses a second Gmail on another phone, add that too (limit 100).
4. Wait one or two minutes.

**C. Sign in again**

1. On the phone, Settings → **Sign in with Google**. Pick that same Gmail.
2. If you see **Google hasn’t verified this app**:
   1. Tap **Advanced** (small text, sometimes at the bottom).
   2. Tap **Go to Record Book (unsafe)** or **Continue**.
   3. Then Allow Drive access.
3. If you still see **Access blocked**, the Gmail on the phone is not in Test users, or you are still In production. Repeat A and B. Sign out of extra Google accounts on the phone and try the listed Gmail only.

**D. What you are not doing**

- You are not opening your Drive to the world.
- You are not connecting other ranches to your account.
- You are not starting Google’s verification video/privacy-policy review. That path is only if you Publish for every Google user on earth.
- You are not adding Authorized domains or using Google Search Console. Leave those fields empty.

---

## Walkthrough 2 — Dropbox (Dropbox login)

Official pages: [Dropbox App Console](https://www.dropbox.com/developers/apps), [OAuth Guide](https://developers.dropbox.com/oauth-guide) (mobile apps use PKCE: App key only, no App secret in the phone).

### 2A. Create the app

1. On a computer, open [www.dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) and sign in.
2. Click **Create app**.
3. **Choose an API:** **Scoped access**.
4. **Choose the type of access:** **App folder**. Record Book then only sees a folder Dropbox makes for this app (`Apps/Record Book` in that person’s Dropbox). Other ranches still use **their** Dropbox; this does not put their cattle in yours.
5. **Name:** `Record Book` (if that name is taken, `Record Book herd` is fine).
6. Click **Create app**.

### 2B. Settings tab

You should now be on the app’s **Settings** page.

1. Copy **App key**. Paste it into your notes. Label it **Dropbox App key**. That is `VITE_DROPBOX_APP_KEY`.
2. Leave **App secret** alone. Do not put it in GitHub or the APK. Skipping the secret **is** the PKCE setup the phone uses.
3. If you see **Allow implicit grant** (or “token” grant), leave it **off**.
4. Under **OAuth 2** → **Redirect URIs**, paste this exactly, then click **Add**:

   `me.flyingjranch.recordbook://oauth/callback`

   No spaces. Same spelling as the package name.
5. If you see **Enable additional users** (or “Allow other users to connect”), turn it **on**. Otherwise only *your* Dropbox can sign in, and other ranches cannot use Dropbox login.

### 2C. Permissions tab

1. Click the **Permissions** tab at the top of the Dropbox app page.
2. Check these four (and leave the rest unchecked unless you know you need them):

   - `files.content.read`
   - `files.content.write`
   - `files.metadata.read`
   - `files.metadata.write`

3. Click **Submit** at the bottom. If you skip Submit, login can succeed and file copy still fails.

---

## Walkthrough 3 — Put the two IDs in GitHub

This is how they get baked into the next APK. They are public OAuth client IDs, not farm data. Official: [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).

1. On a computer, open [github.com/Outlaw1297/record-book](https://github.com/Outlaw1297/record-book).
2. Click **Settings** (right side of the repo tabs). If you do not see Settings, you are not signed in as the repo owner.
3. In the left sidebar, scroll to **Security**.
4. Click **Secrets and variables**, then **Actions**.
5. Click **New repository secret**.
6. **Name:** `VITE_GOOGLE_CLIENT_ID`  
   **Secret:** paste the **Web client ID** from walk 1F (must end in `.apps.googleusercontent.com`).  
   Click **Add secret**.
7. Click **New repository secret** again.
8. **Name:** `VITE_DROPBOX_APP_KEY`  
   **Secret:** paste the **App key** from walk 2B (not the App secret).  
   Click **Add secret**.

Names must match exactly, including `VITE_` and the underscores. If you paste the Android client ID into `VITE_GOOGLE_CLIENT_ID`, Google login will still fail.

---

## Walkthrough 4 — Rebuild and install the APK

Adding secrets does not change the APK already on the phone. You have to build again.

1. Open [github.com/Outlaw1297/record-book/actions](https://github.com/Outlaw1297/record-book/actions).
2. In the left list, click **Android APK**.
3. Click **Run workflow** (right side). Branch: **main**. Click the green **Run workflow**.
4. Wait until that run is green (about one to two minutes).
5. Open [the android-debug release](https://github.com/Outlaw1297/record-book/releases/tag/android-debug).
6. Download `record-book-debug.apk` on the phone (Chrome on the phone is easiest).
7. On the phone: Settings → Apps → Record Book → Uninstall (old debug builds can refuse to update).
8. Open the downloaded APK and allow that one install.
9. Open **Record Book** → **Settings**.
10. Tap **Sign in with Google**. Pick **your** Google account.
    - If the screen says **Google hasn’t verified this app** or **this app isn’t verified**, that is the Testing warning, not a failure. Tap **Advanced** (you may need to scroll), then **Go to Record Book (unsafe)**. That only means Google has not reviewed the product listing. It still writes into **your** Drive only.
    - If the screen says **Access blocked** / **has not completed the Google verification process**, skip Publish. Follow [Walkthrough 1H](#walkthrough-1h--if-google-says-it-needs-verification) above.
11. Or tap **Sign in with Dropbox**. Sign into **your** Dropbox. You should return to Record Book, not a folder list of internal storage.

---

## What “success” looks like

| You tap | What should happen |
|---------|-------------------|
| Sign in with Google | Google account picker / consent, then Settings shows your Gmail |
| Sign in with Dropbox | Dropbox website or app login, then back into Record Book |
| Either, after sync | A `RecordBook` folder in **that** Drive or Dropbox |

| You still see | What it means |
|---------------|----------------|
| “not baked into this APK yet” | Secrets missing, wrong names, or you did not install the **new** APK after the rebuild |
| Phone file picker (“Open from”, Dalton’s Z Fold5) | Old APK. Uninstall and install the latest `record-book-debug.apk` |
| Google “isn’t verified” / Advanced | Normal in Testing. Tap Advanced → Go to Record Book. Still **your** Drive. |
| Google “Access blocked” / verification | Publishing is Testing and this Gmail is a test user. See walk 1H. Do not Publish. |
| Audience yellow “OAuth configuration is incomplete” | Click Go to Branding, save App name + your Gmail, leave domains blank. Then **Add users**. Grey Publish is fine. |
| Audience “No rows to display” under Test users | Drive will fail **for you** until your Gmail is listed. Unknown ranches are not added here. |
| Google Search Console / authorized domains | Ignore. Leave domains empty. That box is only if you typed a website. |
| Audience User type External / grey Make internal | Correct on a personal Gmail. Leave External. Still each ranch’s own Google. |
| Grey Publish app / homepage + privacy policy required | Ignore. That is only to leave Testing. Do not add those URLs. |
| Dropbox redirect error | Redirect URI is not exactly `me.flyingjranch.recordbook://oauth/callback` |

Another ranch installs the **same** APK and signs into **their** Google or Dropbox. They never get your herd.

---

## Official docs (if a screen looks different)

Google renamed some menus to **Google Auth Platform**. If **Clients** is missing, finish **Get started** on Branding first.

- [OAuth 2.0 for installed apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Authorize Google user data on Android](https://developer.android.com/identity/authorization)
- [Drive API scopes](https://developers.google.com/drive/api/guides/about-auth)
- [Capgo Google Login on Android](https://capgo.app/docs/plugins/social-login/google/android/)
- [Dropbox OAuth Guide](https://developers.dropbox.com/oauth-guide)
- [Dropbox HTTP OAuth](https://www.dropbox.com/developers/documentation/http/documentation#oauth2-authorize)
- [Exceptions to Google verification (Testing / personal use)](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification#exceptions-to-verification-requirements)
- [GitHub Actions secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
