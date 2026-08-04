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

### Adding many members at once, from a spreadsheet

```bash
npm run members:import                    # checks the file, writes nothing
npm run members:import -- --write         # applies it
npm run members:import -- --reset-only --write   # applies it, shows no passwords
```

Reads `data/club/members.csv`. Use `--file path/to/other.csv` for a different one.

| Column | Required | Notes |
| --- | --- | --- |
| `name` | yes | As it should appear in the portal |
| `email` | yes | Must be real — password reset is the only recovery path |
| `role` | yes | See the words it accepts, below |

The header must contain those three names. **Order does not matter and extra columns
are ignored**, so a spreadsheet the club already keeps — with phone numbers, addresses,
membership numbers — can be used as it is.

```csv
name,email,role
Ashoke Banerjee,ashoke@example.com,president
Ratna Das,ratna@example.com,secretary
Debabrata Roy,debabrata@example.com,cashier
Sujata Mondal,sujata@example.com,member
```

#### The words it accepts for `role`

`cashier` and `accountant` both mean **treasurer**, because that is the word this system
uses and nobody filling in a spreadsheet has a reason to know that. The import accepts
the synonym and **prints what it became**, so a mapping is never silent:

```
  create    debabrata@example.com    treasurer  (from "cashier")
```

| You may write | It becomes |
| --- | --- |
| `president`, `chairman` | `president` |
| `secretary`, `joint secretary` | `secretary` |
| `treasurer`, `cashier`, `accountant` | `treasurer` |
| `member`, `ordinary member`, `general member` | `member` |
| `administrator`, `admin` | `administrator` |
| `volunteer`, `visitor` | as written |

Anything else is refused by name, with the line number.

#### What it will and will not do

- **Nothing is written unless every row is valid.** A bad role on line 40 stops the
  whole file, so a partial import can never leave the club unsure what happened.
- **Existing accounts are never re-created.** Matched on email address.
- **An existing account whose role differs is re-labelled**, and that is called out
  before it happens — roles decide who can see the club's accounts, so read that list:

  ```
  role      ratna@example.com    member -> secretary

  1 existing account(s) would have their role changed. Roles decide who
  can see the club’s accounts, so check that list before applying it.
  ```

- **Duplicate addresses, empty names and malformed addresses** are reported with line
  numbers.
- Re-running after a successful import reports everything as `unchanged`. It is safe to
  run as often as you like.

#### Passwords from an import

By default the generated passwords are printed once, at the end, and stored nowhere.

**Do not redirect that into a file.** A file of working passwords for every member of
the club is a liability, and it will outlive the reason it was created.

The better habit is `--reset-only`: accounts are created with passwords nobody ever
sees, and each member sets their own through **Reset password** on the sign-in page.
That needs their email address to be right, which is the same thing their account needs
anyway.

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

**Sign-in page → Reset password.** There is deliberately **no** "change password" in the
portal — the club asked for it removed, so every password change goes through the emailed
link, which proves control of the address on record.

The consequence worth knowing: a member whose email address is wrong cannot change their
password at all. Fix the address first (Appwrite console → Auth → the user), then have
them use Reset password.

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

### Who can approve — and how you decide it

Approving is not a separate permission. **Any account with a finance role can approve,
except whoever recorded the entry.** So you control who can approve by controlling roles:

| Role | Can record | Can approve someone else's |
| --- | --- | --- |
| `treasurer` (the cashier) | yes | yes |
| `secretary` | yes | yes |
| `president` | yes | yes |
| `administrator` | yes | yes |
| `member`, `volunteer`, `visitor` | no | no |

So to let someone approve:

```bash
npm run user -- role --email person@example.org --role secretary
```

and to stop them:

```bash
npm run user -- role --email person@example.org --role member
```

Effective on their **next request** — no sign-out needed.

### Restricting it further

Two knobs, both in `backend/src/config/constants.ts`, and both a code change plus a
deploy rather than a setting in the app:

- **`FINANCE_ROLES`** — which roles may see and approve the accounts. Remove
  `administrator` if the system's maintainer should not be able to approve club money;
  that is a defensible choice and costs nothing.
- **`REQUIRED_APPROVALS`** — currently `1`, meaning **one approval in addition to** the
  officer who recorded the entry, so two different people have signed. Set it to `2` and
  three people are needed.

```ts
export const FINANCE_ROLES: readonly Role[] = ['treasurer', 'secretary', 'president', 'administrator']
export const REQUIRED_APPROVALS = 1
```

These are deliberately not editable in the interface. A rule that decides how many people
must agree before the club's money moves should not be changeable by one person who is
having a busy afternoon — changing it leaves a commit with a date and an author.

**What you cannot do:** name a specific person as the only approver. The rule is
role-based on purpose, so that a single officer being away does not stop the club
recording money.

### Doing it by hand, without the command line

Roles are Appwrite account **labels**. Appwrite console → **Auth** → the user →
**Labels** → set exactly one of `treasurer`, `secretary`, `president`, `administrator`,
`member`.

One label only. If two role labels are somehow present, the API takes the **least**
privileged, so the outcome does not depend on their order — safe, but not what you
intended.

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

## 7. Where the club's data actually lives

Nothing sensitive is in GitHub, and a check now enforces that.

| What | Where it lives | In GitHub? |
| --- | --- | --- |
| Member names, emails, roles | **Appwrite → Auth** | No |
| Passwords | **Appwrite, hashed.** Not readable by anyone, including you | No |
| Member ids | **Appwrite → Auth** (`npm run user -- list`) | No |
| Funds, categories, the ledger | **Appwrite → Databases** | No |
| Audit trail | **Appwrite → Databases** (`audit_logs`) | No |
| Backups | **Google Drive**, via `scripts/backup-to-drive.sh` | No — `backups/` is ignored |
| `data/club/*.csv` | Your machine only | No — ignored, see below |
| Appwrite keys | `backend/.env` on your machine, and the Function's variables | No — ignored |

### Passwords are not stored anywhere you can read

Appwrite keeps a one-way hash. The generated password from `user create` or
`members:import` is printed **once, to your terminal**, and written nowhere. If it is
lost, the answer is Reset password — there is nothing to look up.

That is a property worth keeping. Anywhere you *could* read a member's password is
somewhere it could leak from.

### The CSV files are inputs, not the record

`data/club/members.csv` and `funds.csv` are how data gets *in*. Once imported, the
database is the record and the CSV is a stale copy. They are git-ignored, and the
`.csv.example` files beside them are what the repository carries instead — enough to show
the columns, with nobody's details in them.

To start from a template on a new machine:

```bash
cp data/club/members.csv.example data/club/members.csv
cp data/club/funds.csv.example   data/club/funds.csv
```

### Why this matters more than it sounds

The repository is **public**. A file deleted in a later commit stays in the history, and
personal data cannot be recalled once pushed. `data/club/members.csv` was tracked for one
commit — it held `example.com` placeholders at the time, so nothing real was published,
but the next `git add -A` after filling it in would have put four people's addresses on
the internet permanently.

So there is now a check, run by `npm run verify` and by CI:

```bash
npm run check:private
```

It fails if `data/club/*.csv`, `backups/`, a `.env` or a service-account key is tracked,
**or if any tracked file contains a real-looking email address**. Reserved documentation
domains (`example.com`, `.test`, `.invalid`, `demo.club`) are allowed; anything else is
treated as somebody's real address.

### Consider making the repository private

It costs nothing on GitHub and removes this whole class of risk. Settings → General →
Danger Zone → Change visibility. It also makes GitHub Actions usable as a backup
scheduler, which a public repository rules out.

---

## 8. Back up before you rely on it

```bash
npm run backup                                   # writes backups/<timestamp>.json
npm run restore -- --file backups/<file>.json    # checks it; --write to restore
bash scripts/backup-to-drive.sh                  # copy into Google Drive
```

Appwrite's free plan takes no backups of its own. **Check every backup you take** —
`restore` without `--write` validates the file in seconds. An untested backup is a
guess, and a club's membership and payment history is not reconstructible from anywhere
else. Detail in [10-appwrite.md § Backups](10-appwrite.md#backups).
