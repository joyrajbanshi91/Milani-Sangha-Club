# Running the club office — the manual workflows

Everything an office bearer or an administrator has to do by hand: creating accounts,
granting roles, passwords, and setting up the club's funds. Written so it can be
followed by someone who did not build the system.

All commands run from the repository root, on a machine where `backend/.env` holds the
Appwrite credentials.

---

## 1. Accounts and roles

### Create an account for a member

```bash
npm run user -- create --email person@example.com --name "Their Full Name" --role member
```

It prints a strong generated password **once**. Nothing stores it in readable form
afterwards, including Appwrite — so if it is lost, use "Reset password" rather than
looking for it.

Two ways to hand it over, in order of preference:

1. **Do not.** Create the account, tell the person their email address is registered,
   and ask them to use **Reset password** on the sign-in page. Nobody but they ever
   knows the password.
2. Give them the printed password over a channel you trust, and tell them to change it
   in the portal. The office then stops holding a working password.

Use a real address they can receive mail at. Password reset is the only recovery path,
and it goes to that address.

### The roles

| Role | Sees the club's accounts | Typical holder |
| --- | --- | --- |
| `president` | yes | The president |
| `secretary` | yes | The secretary |
| `treasurer` | yes | **The accountant** — this is the role to give them |
| `administrator` | yes | Whoever maintains the system |
| `member` | no | Every ordinary member |
| `volunteer`, `visitor` | no | Not used yet |

"Accountant" is `treasurer` in the system. There is no `accountant` role, and
`npm run user -- role --role accountant` will be refused.

### Change somebody's role

```bash
npm run user -- role --email person@example.com --role treasurer
```

Takes effect on their **next request** — they do not need to sign out. Roles are
Appwrite account *labels*, which only a server key can set, so a member cannot promote
themselves.

### See who exists

```bash
npm run user -- list
```

### Take away access

```bash
npm run user -- disable --email person@example.com
```

Disabling keeps the record and the audit trail. Deleting an account that has recorded
finance entries would leave those entries pointing at nobody.

### You need at least two officers

`REQUIRED_APPROVALS` is **1 approval in addition to** whoever recorded an entry, and
an officer can never approve their own. **With one account, nothing can ever be
posted** — the entry sits pending and the finance area looks broken when it is working
exactly as intended.

Three officer accounts, each a real person with their own password, is the sensible
arrangement. Sharing one account defeats the rule entirely.

---

## 2. Passwords

### A member changes their own

**Sign in → My membership → Change your password.** Needs the current password.

### A member has forgotten theirs

**Sign-in page → Reset password.** Appwrite emails a link that lands on
`/reset-password`, valid for **one hour**. The message shown is the same whether or not
the address has an account — telling a stranger which addresses are registered is an
information leak.

If the link says it is incomplete, the one-time code is missing or already used. Ask
for a fresh one.

### The office resets somebody's password

There is no command for setting a password on another account, deliberately: a password
the office can set is a password the office knows. Ask them to use **Reset password**.
If their email address has changed, fix that in the Appwrite console first.

### Requirements

At least 8 characters — Appwrite's minimum. Length beats cleverness.

---

## 3. The club's funds and categories

### Categories

Sixteen are loaded. They carry no money, so they are safe to change at any time. Edit
`data/club/categories.csv`, then:

```bash
npm run seed:finance -- --dir ../data/club            # shows what it would add
npm run seed:finance -- --dir ../data/club --write
```

Re-running is safe: anything already present by name is left alone.

### ⚠️ Funds have zero opening balances and need the real figures

Three funds exist — Cash box, Bank account, Club UPI — each with an opening balance of
**0**, and each carries a note saying so. That is not a placeholder to be ignored: a
fund's opening balance is what every closing figure in every later report is built on,
so while these are zero, **every balance the system shows is wrong by whatever the club
actually held**.

Nothing was invented here on purpose. Filling them in is a decision only the treasurer
can make.

To set them:

1. Choose an **opening date** — the day the club starts keeping its books in this
   system. The first of a month is easiest to reconcile.
2. Get the real balance for each fund on that date: count the cash box, read the bank
   statement, check any UPI balance held separately.
3. Edit `data/club/funds.csv`. Amounts are in rupees, decimals allowed:

   ```csv
   name,kind,opening_balance,opening_date,active,notes
   Cash box,cash,4820.50,2026-08-01,yes,Counted by the treasurer
   Bank account,bank,63400,2026-08-01,yes,Statement balance
   Club UPI,upi,0,2026-08-01,yes,Swept to the bank daily
   ```

4. **The seed skips funds that already exist by name.** So to correct a fund that is
   already loaded, change it in the Appwrite console — console → Databases → the
   database → `finance_funds` → the row → `openingBalancePaise`. Note **paise**: ₹4,820.50
   is `482050`.

Get this right before recording many entries. Correcting an opening balance later is
one number, but every statement printed in between was wrong.

### Do not import historical transactions

`data/club/transactions.csv` is empty and should stay that way unless the club is
importing a ledger it has actually reconciled. History before the opening date is
*represented by* the opening balances rather than re-entered — which is how a treasurer
hands over a set of books on paper.

---

## 4. Recording money — the two-person rule

1. An officer records an entry in **Office → Entries**. It is `pending` and has moved
   no balance.
2. A **different** officer approves it. It becomes `posted`, gets a gapless reference
   number, and the balances move.
3. Nothing is ever deleted. A mistake is **reversed** — the original entry stays and a
   matching opposite entry is added, so the record explains itself years later.

An officer may **withdraw** their own entry while nobody else has approved it. Once
somebody has, it must be posted or rejected, so the record shows what happened.

---

## 5. Testing it end to end

Sign in at <https://newmilanisanghaclub.appwrite.network/login>.

| Step | Expect |
| --- | --- |
| Choose **Office bearers**, sign in as the treasurer | Lands on `/office`; **no** amber "Sample data" bar |
| Office → Entries → record an income entry | Saved as pending |
| Try to approve it yourself | Refused: approval needs a different officer |
| Sign out | Returns to the sign-in page, and going back to `/office` asks you to sign in |
| Sign in as the secretary, approve the entry | Posts; the dashboard figures move |
| Reports → download the PDF | A real PDF opens |
| My membership → Change your password | Succeeds with the current password, refused without it |
| Sign-in page → Reset password | Email arrives; its link opens the new-password page |
| Choose **General members**, sign in as a member | Lands on `/portal`; `/office` explains it is not available to them |

The amber **Sample data** bar appearing anywhere means the API has lost its database
credentials and is serving the demo ledger. Check with:

```bash
npm run appwrite:check
```

---

## 6. When something does not work

| Symptom | Cause |
| --- | --- |
| "Could not reach the club's server" | The site cannot reach the API. Check `npm run appwrite:check`, and that `CORS_ORIGINS` on the function lists the site's domain |
| Sign-in or sign-out does nothing at all | The site's domain is not a registered **Web platform**: Appwrite console → your project → Settings → Platforms. Appwrite refuses browser calls from unlisted origins, silently as far as the app can tell |
| A reset link goes to "Page not found" | An old build. The `/reset-password` route was added later; redeploy the site |
| Entries cannot be recorded | No funds or categories. See section 3 |
| An entry will not post | The two-person rule. See section 4 — you need a second officer account |
| Amber "Sample data" bar | The API has no database credentials; it is showing the embedded demo ledger |

---

## 7. Back up before you rely on it

```bash
npm run backup                                   # writes backups/<timestamp>.json
npm run restore -- --file backups/<file>.json    # checks it; --write to restore
bash scripts/backup-to-drive.sh                  # copy into Google Drive
```

Appwrite's free plan takes no backups of its own. **Check every backup you take** —
`restore` without `--write` validates the file in seconds. An untested backup is a
guess, and a club's membership and payment history is not reconstructible from anywhere
else. Detail in [10-appwrite.md § Backups](10-appwrite.md#backups).
