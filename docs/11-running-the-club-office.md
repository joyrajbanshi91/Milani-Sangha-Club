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

### You still want at least two officers

`REQUIRED_APPROVALS` is now **0**, so one officer can record an entry and it is posted
immediately — the club asked for that, and §4 sets out what it costs.

Two officers are still worth having, for one rule that has not changed: **an officer
cannot verify their own membership payment.** With a single active officer, that
officer's own subscription can never be verified, no receipt is issued for it, and their
months never show as paid. Nothing is broken; there is simply nobody else to check it.

Each officer should be a real person with their own password. Sharing one account
destroys the only remaining record of who did what.

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

### Opening balances

A fund's opening balance is what every closing figure in every later report is built on.
While one is wrong, **every balance the system shows is wrong by the same amount** — and
nothing on screen can tell you, because the figure is arithmetically consistent either
way.

Current state, as loaded from `data/club/funds.csv`:

| Fund | Opening balance | On |
| --- | --- | --- |
| Bank account | ₹49,460.00 | 1 April 2026 |
| Cash box | ₹0.00 | 1 April 2026 |
| Club UPI | ₹0.00 | 1 April 2026 |

**Check the two zeros.** If the club held cash on 1 April, the cash box figure is wrong.

To set or correct them:

1. Choose an **opening date** — the day the club starts keeping its books here. 1 April
   suits an Indian financial year and is easiest to reconcile.
2. Get the real balance for each fund on that date: count the cash box, read the bank
   statement, check any UPI balance held separately from the bank.
3. Edit `data/club/funds.csv`. Amounts are in rupees, decimals allowed:

   ```csv
   name,kind,opening_balance,opening_date,active,notes
   Cash box,cash,4820.50,01/04/2026,yes,Counted by the treasurer
   Bank account,bank,49460,01/04/2026,yes,Statement balance
   Club UPI,upi,0,01/04/2026,yes,Swept to the bank daily
   ```

   Dates may be `2026-04-01` or `01/04/2026` — **day first**, so `01/04/26` is 1 April.
   A spreadsheet reformats a typed date to the local convention on its own, so both are
   accepted; the script prints what it read, and you should check that line.

4. Apply it. Adding a fund and *changing* one are separate flags, because changing an
   opening balance moves every balance in the accounts without leaving an entry anywhere:

   ```bash
   npm run seed:finance -- --dir ../data/club --update-funds            # shows the diff
   npm run seed:finance -- --dir ../data/club --update-funds --write
   ```

   Without `--update-funds`, funds that already exist are left alone and the differences
   are only reported.

Get this right before recording many entries. Correcting it later is one number, but
every statement printed in between was wrong.

### Clearing the entries made while learning

Everything recorded while trying the system out can be thrown away, so the club's first
real entry is `TXN-2026-000001`:

```bash
npm run backup                       # first, always
npm run reset:ledger                 # lists what would go
npm run reset:ledger -- --write
```

It removes **every** finance entry whatever its status, every member payment
declaration, the audit log, and the reference counters. It keeps the funds, the
categories, the member profiles and every account.

Payment declarations go with the entries deliberately: one left behind would tell its
member "verified, entered as TXN-2026-000002" and point at an entry that no longer
exists.

This is the only thing in the system that deletes a posted entry, and it is a script
rather than a button on purpose. Through the API the ledger is append-only — a mistake is
cancelled by a reversal and both halves stay on the record. Wiping the books clean before
the club starts is a different act, it happens once, and it needs the server key.

### Do not import historical transactions

`data/club/transactions.csv` is empty and should stay that way unless the club is
importing a ledger it has actually reconciled. History before the opening date is
*represented by* the opening balances rather than re-entered — which is how a treasurer
hands over a set of books on paper.

---

## 4. Recording money — one officer

1. An officer records an entry in **Office → Entries**. It is **posted immediately**:
   it gets a gapless reference number and the balances move.
2. Nothing is ever deleted. A mistake is **reversed** — the original entry stays, marked
   `reversed`, and a matching opposite entry is added, so the record explains itself
   years later.

### ⚠️ This used to take two people

`REQUIRED_APPROVALS` was `1`, meaning one approval **in addition to** whoever recorded
the entry — so two different people had to sign before any money moved. The club asked
for one, and it is now `0`.

Be clear about what changed, because the software no longer prevents it: **a single
officer can now enter whatever they like into the club's books.** At `1`, they could not
— an officer could record but never approve their own entry.

What still protects the club:

- every entry names **who recorded it**, with a timestamp, in the audit log
- **nothing can be deleted.** Cancelling a posted entry creates a reversal, and both
  halves stay on the record for anyone reading the statement afterwards
- an officer **still cannot verify their own membership payment** — a different
  question, and one that matters more now that a single signature is enough
- the detailed statement lists every entry with the officer who made it

If the committee wants the two-person rule back, it is one line — see below. Nothing
else has to change: the approval queue, the self-approval refusal and their tests are
all still in place and still tested.

### Who can record

| Role | Can record and post | Can verify a member's payment |
| --- | --- | --- |
| `treasurer` (the cashier) | yes | yes — but never their own |
| `secretary` | yes | yes — but never their own |
| `president` | yes | yes — but never their own |
| `administrator` | yes | yes — but never their own |
| `member`, `volunteer`, `visitor` | no | no |

So to let someone record entries:

```bash
npm run user -- role --email person@example.org --role secretary
```

and to stop them:

```bash
npm run user -- role --email person@example.org --role member
```

Effective on their **next request** — no sign-out needed.

### Putting the two-person rule back, or tightening it further

Two knobs, both in `backend/src/config/constants.ts`, and both a code change plus a
deploy rather than a setting in the app:

- **`REQUIRED_APPROVALS`** — approvals needed **in addition to** whoever recorded the
  entry. `0` today: one officer, posted immediately. `1` means two different people must
  sign; `2` means three.
- **`FINANCE_ROLES`** — which roles may see the accounts and record entries. Remove
  `administrator` if the system's maintainer should not be able to move club money; that
  is a defensible choice and costs nothing.

```ts
export const FINANCE_ROLES: readonly Role[] = ['treasurer', 'secretary', 'president', 'administrator']
export const REQUIRED_APPROVALS = 0
```

Changing `REQUIRED_APPROVALS` to `1` needs nothing else. Entries start `pending`, the
recording officer cannot approve their own, and **Office → Entries** shows the queue —
all of it already written and tested. Remember that with only one officer account,
nothing could ever be posted; three real people with their own passwords is the sensible
arrangement.

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

## 5. Members' payments — how a member's money gets into the books

A member pays the club, and tells the club they have. An office bearer checks that
against the club's records and enters it. This is the only way anything a member does
reaches the accounts, and it is deliberately a **declaration**, not a payment: the
website never takes money.

### What membership costs

**₹50 a month, or ₹600 for the year.** The club's year runs **April to March**, so
2026-27 means April 2026 to March 2027. Twelve months at the monthly rate is exactly the
yearly rate, so paying annually is a convenience rather than a discount.

To change the rates, edit `MEMBERSHIP_DUES` in `backend/src/config/constants.ts` **and**
the identical block in `frontend/src/config/constants.ts` — `npm run check:constants`
fails the build if they drift apart. Everything else follows: the form, the register, the
receipts and the officers' totals all price from one function.

### What the member does

**My membership → Tell the club about a payment.**

They pay first — UPI, cash, or bank transfer — and then record it. In that order, because
the acknowledgement number does not exist until the form is submitted, so there is
nothing to quote in a UPI note. What the treasurer actually matches against is:

| Paid by | The member must enter |
| --- | --- |
| UPI | the transaction ID (the UTR) their app shows |
| Bank | the cheque number, or the bank's reference |
| Cash | which office bearer took it |

For a **membership** payment they also choose which months: one month (the form offers
their first unpaid one), the rest of the year, or a particular range. **They do not type
the amount** — it is worked out from the months and shown to them. A member cannot pay
₹50 and claim twelve months.

They get an acknowledgement number — `REF-2026-000001` — to quote if they ask about it.
It is **not** a receipt, and the screen says so.

A member sees only their own declarations, and can **withdraw** one while nobody has
acted on it. Two guards stop the register becoming a guess:

- the same payment cannot be declared twice while the first is still waiting
- **months already paid or already claimed are refused**, naming which ones and under
  which reference

One payment cannot cross two membership years — April to March is the year, and a
payment spanning two could not be filed in either register.

### The member's own record: months paid, months left

**My membership** shows the year as twelve boxes: green and ticked for paid, red for
unpaid and already due, grey for months still to come. Underneath: months paid out of
twelve, months left, and what those cost.

A month counts as paid only when an office bearer has **verified** the payment behind it.
A declaration sitting in the queue shows as unpaid, because a form is not money.

### Receipts

Once a payment is verified, a **Download receipt** button appears against it in the
member's list, and the receipt number (`RCT-2026-000001`) with it. The receipt carries:

- the member, the amount, and **which months it covers**, in words
- how they paid and the reference matched against
- the declaration and the ledger entry it produced, so it can be traced
- two signature lines — **Cashier / Treasurer** and **Approved by** — both naming the
  officer who verified it

Both lines name the same officer, because one officer records and posts. That is
deliberate: two different names would claim a second check nobody made. The lines are
left ruled for a hand signature, which is what a paper receipt needs.

An officer can reprint any member's receipt from **Office → Members' payments** — the
commonest request an office ever gets.

Receipt numbers are a separate gapless series from declaration references, numbered by
the year the money was **paid**, so a receipt issued in April for a March payment sits in
the right book. There is no receipt for a payment that has not been verified, and asking
for one says so rather than producing a blank document.

### What the office bearer does

**Office → Members' payments.** Newest last: the queue is oldest-first, because these are
people waiting.

1. **Check the payment is real.** The UPI statement, the cash box, the cheque. The screen
   shows you exactly what to match against.
2. **Verify this payment**, then say **which fund** it landed in and **which category** it
   belongs to. The form insists, because a member cannot tell you either — they have no
   business knowing the club's chart of accounts, and guessing would file every
   subscription in whichever fund happens to be first in the list.
3. Or **Cannot find it**, with a reason. The member sees the reason.

### What recording it actually does

Three things at once:

- an **ordinary ledger entry**, exactly as if you had typed it into Office → Entries —
  dated the day the **member** paid, not the day you got round to it, attributed to you,
  and posted immediately
- a **receipt number**, which is what makes the member's download button appear
- the **months are marked paid** in the register, if it was a membership payment

### An officer cannot verify their own payment

A treasurer pays their subscription like everybody else. When they declare it, the
**Verify** button is not offered to them and the API refuses it — another officer has to
confirm it.

This is not bureaucracy for its own sake, and it matters more now that a single officer
can post an entry. The question being answered at this step is "did this money actually
arrive?", and nobody can answer that about themselves.

**If your club has only one active officer, nobody can verify that officer's own
subscription.** That is the rule working, not a fault. Give a second person the
`secretary` role — see §1.

### If it goes wrong halfway

If the ledger entry is created but the declaration cannot be marked verified — almost
always because another officer recorded the same one a moment earlier — you get a message
naming the entry and telling you to withdraw it. Do that, in Office → Entries. The
declaration stays in the queue so it can be dealt with once, properly.

---

## 6. The membership register, and the two statements

### Who has paid what

**Office → Membership register.** Every account the club has, for one membership year,
each with their twelve boxes and what they still owe.

- **Sorted by who owes the most**, not alphabetically. The list is there to be acted on.
- **Every account appears**, including members who have paid nothing — those are the rows
  the meeting is about. A list built from the payments table would leave exactly them out.
- Filter to **Still owing** or **Paid in full**, search by name or email, and switch
  membership year with the picker.

Along the top: how many members, how much is **overdue now** (months already begun and
unpaid), how much is outstanding for the whole year, and how many declarations are
waiting to be checked.

A member's months come from payments an officer verified, so this register and the
receipts members hold can never disagree.

### The two statements

**Office → Statements**, for a month or any date range. Same figures in both; they differ
in how much they show.

| | Shows | For |
| --- | --- | --- |
| **Summary** | Totals by category, with every membership payment merged into one line | The committee, the noticeboard, the AGM |
| **Detailed** | Every entry, with who each payment came from | Checking the books against the bank statement |

The summary deliberately leaves out the by-source breakdown and the entry list, because
both name individual members — a page of who paid what is not what goes on a
noticeboard. It says on its face how many entries sit behind the totals and that the
detailed version has them.

Filenames carry the club, which report, the period and the day it was issued:

```
Milani-Sangha-Club-summary-2026-04-issued-2026-08-05.pdf
Milani-Sangha-Club-detailed-2026-04-05-to-2026-05-20-issued-2026-08-05.pdf
```

A period that is exactly one calendar month is named as that month. Two downloads of the
same month no longer arrive as `statement.pdf` and `statement(1).pdf` with nothing to
tell them apart.

---

## 7. Testing it end to end

Sign in at <https://newmilanisanghaclub.appwrite.network/login>.

| Step | Expect |
| --- | --- |
| Choose **Office bearers**, sign in as the treasurer | Lands on `/office`; **no** amber "Sample data" bar |
| Office → Entries → record an income entry | **Posted straight away**; the dashboard figures move |
| Cancel it by reversal | The original shows `reversed`, a matching opposite entry appears, and the total returns to where it was |
| Sign out | Returns to the sign-in page, and going back to `/office` asks you to sign in |
| Statements → download **both** PDFs | Two files; the summary has no entry list, the detailed one does, and both names carry the period and today's date |
| Sign-in page → Reset password | Email arrives; its link opens the new-password page |
| Choose **General members**, sign in as a member | Lands on `/portal`; `/office` explains it is not available to them |
| Try the **Office bearers** door with that member's account | Refused, and told to use the General members entrance |

Then the membership flow, which crosses both areas:

| Step | Expect |
| --- | --- |
| As a member: My membership | Twelve boxes, all unpaid; "0 of 12 months paid", ₹600 outstanding |
| Declare a payment — one month, by UPI | The amount shows ₹50 and **cannot be typed over**; sends with an acknowledgement `REF-…`, listed as *Awaiting verification* |
| Look at the twelve boxes again | Still unpaid — a declaration is not money until it is verified |
| Try to declare the same month again | Refused, naming the month and the reference already claiming it |
| Try "the rest of the year" | Priced at ₹550 for the remaining 11 months |
| As the treasurer: Office → Members' payments | Listed, with the UPI transaction ID to match against |
| Verify it, choosing a fund and category | Entered as `TXN-…`, posted; a receipt number `RCT-…` is issued |
| Office → Membership register | That member shows 1 of 12, one green box, and the rest red or grey |
| Back as the member | The month is green; **Download receipt** appears and gives a PDF naming the month and the officer |
| As the treasurer: declare a payment of your own | Office → Members' payments offers no **Verify** button for it, and says another officer must |

The amber **Sample data** bar appearing anywhere means the API has lost its database
credentials and is serving the demo ledger. Check with:

```bash
npm run appwrite:check
```

---

## 8. When something does not work

| Symptom | Cause |
| --- | --- |
| "Could not reach the club's server" | The site cannot reach the API. Check `npm run appwrite:check`, and that `CORS_ORIGINS` on the function lists the site's domain |
| Sign-in or sign-out does nothing at all | The site's domain is not a registered **Web platform**: Appwrite console → your project → Settings → Platforms. Appwrite refuses browser calls from unlisted origins, silently as far as the app can tell |
| A reset link goes to "Page not found" | An old build. The `/reset-password` route was added later; redeploy the site |
| Entries cannot be recorded | No funds or categories. See section 3 |
| An entry will not post | The two-person rule. See section 4 — you need a second officer account |
| Amber "Sample data" bar | The API has no database credentials; it is showing the embedded demo ledger |

---

## 9. Where the club's data actually lives

Nothing sensitive is in GitHub, and a check now enforces that.

| What | Where it lives | In GitHub? |
| --- | --- | --- |
| Member names, emails, roles | **Appwrite → Auth** | No |
| Passwords | **Appwrite, hashed.** Not readable by anyone, including you | No |
| Member ids | **Appwrite → Auth** (`npm run user -- list`) | No |
| Funds, categories, the ledger | **Appwrite → Databases** | No |
| Members' declared payments | **Appwrite → Databases** (`payments`) | No |
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

## 10. Back up before you rely on it

```bash
npm run backup                                   # writes backups/<timestamp>.json
npm run restore -- --file backups/<file>.json    # checks it; --write to restore
bash scripts/backup-to-drive.sh                  # copy into Google Drive
```

Appwrite's free plan takes no backups of its own. **Check every backup you take** —
`restore` without `--write` validates the file in seconds. An untested backup is a
guess, and a club's membership and payment history is not reconstructible from anywhere
else. Detail in [10-appwrite.md § Backups](10-appwrite.md#backups).
