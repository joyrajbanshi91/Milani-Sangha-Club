# Running it for real

How to move from the demonstration mode to real accounts and a real database, on
your own machine. Nothing here publishes the site to the internet — that is
[05-deployment.md](05-deployment.md).

**The switch is automatic.** The moment Firebase Admin credentials exist in
`backend/.env`, the API stops using the in-memory demo store and the fixed demo
accounts, and starts using Firestore and Firebase Authentication. There is no flag
to set.

> Use a **separate Firebase project for testing** — call it
> `milani-sangha-test`. Then real member data and experiments never share a
> database, and you can delete the test project without a second thought.

---

## 1. Create the Firebase project

In the [Firebase console](https://console.firebase.google.com):

1. **Add project.** Name it, and turn Google Analytics off — you do not need it.
2. **Build → Authentication → Get started → Email/Password → Enable.**
   Leave "Email link (passwordless sign-in)" off.
3. **Build → Firestore Database → Create database.**
   - Start in **production mode**. The rules in this repository are the authority;
     test mode would leave the club's data open for 30 days.
   - Location: **`asia-south1` (Mumbai)** for the lowest latency to Indian
     members. **This cannot be changed later.**
4. **Project settings → General → Your apps → Add app → Web.**
   Register it and copy the config values shown.

Storage is **not** needed yet: profile pictures are stored on the member's own
record, and gallery media comes later.

### Realtime Database is not the same thing

The snippet Firebase shows you may include a `databaseURL` like
`https://<project>-default-rtdb.asia-southeast1.firebasedatabase.app`. That is the
**Realtime Database**, a different product. This app uses **Cloud Firestore**, so
that value is not used anywhere and can be ignored. If you created a Realtime
Database, you still need to create Firestore separately in step 1.3.

### Checking what a project actually has

Two commands, no credentials needed, that report the real state rather than what
you think you configured:

```bash
# Is the API key valid, and is Email/Password sign-in enabled?
curl -s -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$VITE_FIREBASE_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"probe@example.invalid","password":"x","returnSecureToken":true}'
```

| Response | Meaning |
| --- | --- |
| `INVALID_LOGIN_CREDENTIALS` or `EMAIL_NOT_FOUND` | Key valid **and** Email/Password enabled — this is what you want |
| `CONFIGURATION_NOT_FOUND` | Authentication has not been set up on the project at all |
| `OPERATION_NOT_ALLOWED` | Authentication exists, but the Email/Password provider is off |
| `API key not valid` | Wrong key |

```bash
# Does Cloud Firestore exist?
curl -s "https://firestore.googleapis.com/v1/projects/<projectId>/databases/(default)/documents/finance_funds"
```

| Response | Meaning |
| --- | --- |
| `PERMISSION_DENIED` … *"Missing or insufficient permissions"* | Firestore exists, rules are denying anonymous reads — correct |
| `PERMISSION_DENIED` … *"Cloud Firestore API has not been used in project…"* | Firestore has **not** been created yet |
| `NOT_FOUND` | No default database |

Read the message, not just the status: both Firestore answers are 403.

---

## 2. Point the web app at it

Copy the values from step 1.4 into `frontend/.env.local`, replacing the
placeholders:

```ini
VITE_FIREBASE_API_KEY=AIza…
VITE_FIREBASE_AUTH_DOMAIN=milani-sangha-test.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=milani-sangha-test
VITE_FIREBASE_STORAGE_BUCKET=milani-sangha-test.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123
```

These are **public by design** — they identify the project, they do not grant
access. Access is controlled by Authentication and the security rules.

---

## 3. Give the API its credentials

**Project settings → Service accounts → Generate new private key.** Save the JSON
**outside this repository**:

```bash
mkdir -p ~/.config/milani
mv ~/Downloads/milani-sangha-test-*.json ~/.config/milani/service-account.json
chmod 600 ~/.config/milani/service-account.json
```

Then in `backend/.env`:

```ini
GOOGLE_APPLICATION_CREDENTIALS=/Users/joy/.config/milani/service-account.json
FIREBASE_PROJECT_ID=milani-sangha-test
CLUB_NAME=New Milani Sangha Club
```

> This key bypasses every security rule. Treat it like the club's bank password:
> never commit it, never paste it into a chat or a ticket. If it is ever exposed,
> revoke it under **Service accounts → Manage keys**.

Restart the API and check the log. It should now say:

```
store: "firestore"   auth: "firebase"
```

If it still says `memory` and `demo`, the credentials are not being read — check
the path is absolute and the file is readable.

---

## 4. Deploy the security rules

Creating the database in **production mode** already leaves it denying all client
access, so nothing is exposed while you get to this. Publishing our rules is still
worth doing: it is what will allow officer reads directly from the browser if a
future feature needs them, and it keeps the rules in git as the single authority.

### If `firebase` is "command not found"

A global install needs `sudo` on a stock Node installation. You do not need one:

```bash
npm run firebase -- --version     # runs it through npx, nothing installed
npm run firebase -- login
npm run firebase -- deploy --only firestore:rules,firestore:indexes --project your-project-id
```

### Without an interactive login

```bash
npm run rules:push
```

This uploads the rules through the Rules API using the Admin service account,
skipping the CLI's Service Usage pre-flight check, which that account is not
permitted to make.

It may still stop at the final step with **"The caller does not have permission"**.
The Admin SDK service account can *compile* a ruleset but not *release* it. Either:

- grant it **Firebase Rules Admin** in Google Cloud IAM → **IAM & Admin → IAM**,
  find `firebase-adminsdk-…@<project>.iam.gserviceaccount.com`, add the role, then
  re-run `npm run rules:push`; or
- use the interactive login above, which has your own permissions.

The rules make the `finance_*` collections readable **only** by an officer role and
**writable by nobody** from a browser — all financial writes go through the API,
because the two-person rule and gapless reference numbers cannot be expressed in a
security rule.

---

## 5. Create the officers

There is no sign-up screen, and that is deliberate: the first officer has to exist
before anyone can sign in to grant anything, and a self-service "make me the
treasurer" button would defeat the two-person rule.

```bash
npm run user -- create --email treasurer@example.org --name "A Name" --role treasurer
npm run user -- create --email secretary@example.org --name "B Name" --role secretary
npm run user -- create --email president@example.org --name "C Name" --role president
npm run user -- create --email member@example.org    --name "D Name" --role member
```

**Create at least two officers.** With one you cannot approve anything — that is
the rule working, not a bug.

Each `create` prints a one-time password. Better: ignore it and have the person use
**"Reset password"** on the sign-in page, so no password ever passes through you.

Useful afterwards:

```bash
npm run user -- list                                          # who exists, with roles
npm run user -- role --email x@example.org --role president   # change a role
npm run user -- disable --email x@example.org                 # lock out, revoke sessions
```

A role change reaches the browser when the ID token next refreshes, within an hour —
or immediately if the person signs out and back in.

---

## 6. Load the chart of accounts

The funds and categories have to exist before any entry can be recorded. Put your
real figures in a folder — copy `data/demo/` as a starting point — and load them:

```bash
# Check first: validates the files and prints what it would do. Writes nothing.
npm run seed:finance -- --dir ../data/club

# Then apply
npm run seed:finance -- --dir ../data/club --write
```

**Get the opening balances right.** Every closing figure in every report is the
opening balance plus what follows it. If they are wrong, everything is wrong.

Existing funds and categories are skipped by name, so adding a row and re-running
is safe. Column reference: [data/demo/README.md](../data/demo/README.md).

Transactions are **not** loaded by default. `--with-transactions` writes them as
`pending`, each still needing an officer's approval — useful for filling a test
project, not for real data.

---

## 7. Sign in and test

```bash
npm run dev
```

<http://localhost:5173/login> now shows an **email and password form** instead of
the demo account picker. That is how you know the switch worked.

Worth walking through, in this order:

| Step | What should happen |
| --- | --- |
| Sign in as the **member** | Lands on `/portal`. No "Office" tabs anywhere |
| Member visits `/office` directly | Refused, with a plain explanation |
| Member sets a **profile picture** | Saves; reload and it is still there |
| Sign in as the **treasurer** | `/office` dashboard loads, all figures zero apart from opening balances |
| Treasurer records an entry | Saved as **pending**. Dashboard figures do **not** move |
| Treasurer tries to approve it | Refused — "must be approved by a different officer" |
| Sign in as the **secretary**, approve it | Posts. The figures move now |
| Reverse the posted entry | Creates a pending opposite entry; needs a second officer again |
| **Reports → Download PDF** | A statement that reconciles |
| Restart the API, reload | **Everything is still there.** This is the real test that you are on Firestore |

That last row is the one that matters. In demo mode a restart wipes everything; on
Firestore nothing is lost.

---

## Going back to demo mode

Comment out `GOOGLE_APPLICATION_CREDENTIALS` in `backend/.env` and restart. The API
returns to the in-memory store and the fixed accounts. Your Firestore data is
untouched and comes back when you restore the line.

---

## Troubleshooting

**Sign-in says "Email and password sign-in is not enabled".**
Step 1.2 was skipped. Enable the Email/Password provider.

**Sign-in works, but every officer page says you are not an officer.**
The account has no role claim, so it is treated as an ordinary member. Run
`npm run user -- list` to check, then `npm run user -- role …`, then sign out and
in.

**Signed in, but the API returns 401.**
The web app and the API are pointed at different Firebase projects. The ID token is
issued by `VITE_FIREBASE_PROJECT_ID` and verified against the service account's
project — they must match.

**Everything disappears when the API restarts.**
You are still in demo mode. The startup log will say `store: "memory"`.

**`Missing or insufficient permissions` in the browser console.**
Step 4 was skipped, or the rules were deployed to a different project.

**The API warns about credentials but otherwise works.**
Expected in demo mode. In Firebase mode that warning should be gone.

**`/api/v1/health/ready` returns 503 with "Failed to parse private key".**
The credentials are present but malformed — usually the `\n` sequences in
`FIREBASE_PRIVATE_KEY` were expanded into real newlines by an editor, or the
quotes were dropped. Note that the API still **starts** and still answers
`/health`: a bad key is meant to fail the routes that need the database, not the
whole service.

---

## Before real member data goes in

- Use a **separate project** from any test one, and set a **budget alert** on it.
- Schedule Firestore backups — the club's membership and payment history is not
  reconstructible from anywhere else:
  `gcloud firestore export gs://<project>-backups`
- Replace the placeholder content and set `contentStatus` to `'reviewed'`
  ([06-editing-the-website.md](06-editing-the-website.md)).
- Settle the six membership decisions in
  [04-development-phases.md](04-development-phases.md), because member numbers and
  validity dates are hard to change once receipts have been issued.
- Note what is still **not built**: membership records, the payment flow itself
  (the UPI and cash form stores nothing yet), and receipts. The finance side is
  complete; the membership side is not.


---

## Using it from another device

Three ways, in increasing order of effort.

### 1. On the same Wi-Fi — the whole app, free

```bash
npm run dev:lan
```

It prints the address to open, e.g. `http://192.168.1.3:5173`. Type that into a
phone or another laptop on the same network and **everything works**, including
sign-in and the finance area: the API is proxied through the dev server, so the
browser only ever talks to one origin.

Your machine has to stay awake and running the command. Good for showing the
committee, or testing on a real phone.

### 2. A shareable preview URL — the whole app, free

Push a branch and open a pull request. Netlify builds it and comments with a deploy
preview URL, on which **everything works**, including sign-in and the finance area:
a preview runs the API function too, so the site and the API are one origin there
exactly as they are in production.

Works from anywhere, on any device, with nothing installed, and nothing is
published at the club's real address.

### 3. A real, permanent address — sign-in working online

**Free, and no card.** Netlify serves the PWA and runs the same Express app as a
Netlify Function, so the member area and the finance area work online. The full
walkthrough is [09-netlify.md](09-netlify.md); the short version is: connect the
GitHub repository and push. There is nothing to configure for a first deploy and no
database needed — the site comes up showing sample figures, clearly labelled, and the
club connects a real ledger when it is ready.

No paid plan is needed at any point. Appwrite's free plan covers the database and
sign-in; Netlify's free plan covers the site and the API. Firebase's **Blaze** plan
was only ever required for *hosting the API*, which Netlify now does instead — so it
is not needed even if the club picks Firestore.

Two things people get wrong on the first attempt, both covered in that guide:

- **`VITE_` variables are compiled into the bundle at build time.** Adding or editing
  one changes nothing until a build runs afterwards — use **Clear cache and deploy
  site**, not a plain retry. This no longer breaks a deploy, because none of them is
  required, but it is still why a value "did not take effect".
- **Scope matters.** `VITE_APPWRITE_PROJECT_ID` needs the *Builds* scope to reach the
  bundle; `APPWRITE_API_KEY` must have *Functions* and **not** Builds, or a server
  credential ends up in the browser. If the club uses Firestore instead, the Netlify
  hostname must also be added to **Firebase console → Authentication → Settings →
  Authorised domains**, or sign-in fails with `auth/unauthorized-domain`.

### Hosting the API somewhere else

Nothing ties the API to Netlify. It is a plain Express app with no platform-specific
code — `npm start` is all it needs on anything running Node 22.

Whichever host you pick, two settings connect it up:

1. On the API host, set `CORS_ORIGINS` to the website's URL, plus the database
   credentials — the three `APPWRITE_*` values, or the `FIREBASE_PROJECT_ID` /
   `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` trio where there is no key file
   to mount.
2. Rebuild the frontend with `VITE_API_BASE_URL=https://your-api-host/api/v1`, then
   redeploy the site.

That plumbing already exists and is tested; it is the same code path used locally.
Expect a slow first request on a free tier, which spins the service down when idle.

### Before publishing to the club's real address

Before the Netlify URL is given out to members:

- Replace the placeholder content and set `contentStatus` to `'reviewed'`
  ([06-editing-the-website.md](06-editing-the-website.md)). Right now the committee
  page lists "Full name" six times and the testimonials ask to be replaced.
- Check the opening balances on the funds are the club's real figures.
- Work through the verification table in [09-netlify.md](09-netlify.md) — in
  particular `/api/v1/health/ready`, signing in, and a PDF download.
