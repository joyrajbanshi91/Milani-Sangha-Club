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
| `culturalSecretary` | to look, not to change | The cultural secretary |
| `gameSecretary` | to look, not to change | The game secretary |
| `member` | no | Every ordinary member |
| `volunteer`, `visitor` | no | Not used yet |

"Accountant" is `treasurer` in the system. There is no `accountant` role, and
`npm run user -- role --role accountant` will be refused.

The cultural and game secretaries are **read-only**: every screen in the office area
opens for them and none of the buttons are there. The club can give either of them full
access later, and take it back, without a code change — *Letting somebody look without
letting them act*, in section 4.

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
| `cultural secretary`, `culture secretary` | `culturalSecretary` |
| `game secretary`, `games secretary`, `sports secretary`, `joint game secretary` | `gameSecretary` |
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

Two rules both need a second person, so with a single officer account the club is stuck
in two ways — and in each case nothing is broken, there is simply nobody else to ask:

- **Nothing an officer records can be posted.** An entry needs one approval from somebody
  other than the officer who recorded it. With one account, every entry sits pending for
  ever. (A *member's* declared payment is fine — the member is the other person, so a lone
  officer can still accept members' money.)
- **That officer's own subscription can never be verified**, so no receipt is issued for
  it and their months never show as paid.

Three officer accounts is the comfortable arrangement — president, secretary and
treasurer — so one being away never holds the club up. Each must be a real person with
their own password: sharing one account defeats the rule entirely and destroys the record
of who did what.

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

### Starting the club's people again from scratch

Two scripts, because people and money are different things and are almost never
cleared together by accident:

```bash
npm run backup                                   # first, always
npm run reset:members                            # lists what would go
npm run reset:members -- --except you@example.org --write
```

`reset:members` deletes **every sign-in account** and **every member profile** — the
photographs members uploaded. It does not touch funds, categories, the ledger or the
website's enquiries, and it says how many records in the books already name an account
that is gone, which is the usual state by the time somebody asks for a fresh start.

**Keep one account.** `--except you@example.org` spares yours. Delete every account and
nobody can sign in — including the person who would have to put it right — because the
accounts an import creates have passwords nobody knows and the way back in is a
password-reset email for each of them. The script refuses to delete them all unless you
add `--all` and mean it.

Then put the club back from the spreadsheet:

```bash
npm run members:import -- --reset-only --write   # creates them, prints no passwords
npm run user -- list                             # check the names and roles
```

Each person then uses **Reset password** on the sign-in page and sets their own. Their
email addresses have to be right — that is the only way in.

For a *completely* clean start, clear the money as well:

```bash
npm run reset:ledger -- --write
```

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

## 4. Recording money — two people, never three

1. An officer records an entry in **Office → Entries**. It is `pending` and has moved
   no balance. **Every bearer sees it** — on their dashboard and in the entries list —
   and any one of them can act on it.
2. **One** other office bearer approves it. It becomes `posted`, gets a gapless
   reference number, and the balances move.
3. Nothing is ever deleted and nothing can be edited. A mistake is **withdrawn** before
   anyone approves it, or **reversed** afterwards — the original stays, marked
   `reversed`, with a matching opposite entry beside it.

The same shape holds for a **member's payment**, with the member in the first step: they
declare it, every bearer sees the declaration, and one bearer accepting puts it in the
books. Two people either way, and in neither case can they be the same person.

### One approval. Not two.

This caused confusion and it is worth being exact about, because the club read it the
other way round.

**`REQUIRED_APPROVALS` is 1, counted *in addition to* whoever recorded the entry.** So
two people are involved in total: the recorder and one other. There is no third.

What happened before: an officer records an entry, clicks **Approve** on their own
entry, is refused — and reads that refusal as "somebody has already approved this and it
still wants another". It does not. It wants one signature, from anyone except the
author.

Every screen and message now counts it out rather than leaving it to be inferred:

- recording says *"needs 1 more approval — from any office bearer except you"*
- a pending entry shows *"1 approval outstanding"*
- the approve button reads **Approve and post**, because that is what the click does
- approving says *"Approved and posted. The balances now include it."*

### You cannot change your own record

There is **no way to edit a recorded entry** — not for its author, not for anybody else,
whatever their role. No screen offers it and no route accepts it; a test asserts that
`PUT`, `PATCH` and `DELETE` on an entry all return 404.

What you can do instead:

| Situation | What to do |
| --- | --- |
| You made a mistake and nobody has approved it | **Withdraw** it. It becomes `discarded` and never touched a balance |
| Somebody has already approved it | It is posted. **Cancel by reversal** — which itself needs one other bearer's approval |
| Somebody else's entry is wrong | **Reject** it with a reason, if it is still pending |

This applies to every office bearer equally. There is no rank that skips the check: a
president's entry needs a second signature exactly as a treasurer's does, and a
president cannot edit a treasurer's entry any more than the treasurer can.

### A member's payment: one bearer accepting is enough

A member's declared payment is the one thing this number does not govern, and the reason
is that **the member is the maker.** They put the money forward. The bearer who checks it
against the club's records is therefore already the second person — and can never be the
same person, because no officer is offered the **Verify** button on a payment of their
own.

So accepting a declaration **posts it to the books there and then**, on that bearer's
check, and the receipt names them. Asking a third bearer on top was a signature nobody
could justify: it left a member holding a receipt marked *awaiting a second office bearer*
for money the club's figures did not yet include.

An entry an officer **types in themselves** is the opposite case — maker and checker
would be the same person — so it still needs one other bearer, exactly as before.

### Who can record

| Role | Can record | Can approve someone else's | Can verify a member's payment |
| --- | --- | --- | --- |
| `treasurer` (the cashier) | yes | yes | yes — but never their own |
| `secretary` | yes | yes | yes — but never their own |
| `president` | yes | yes | yes — but never their own |
| `administrator` | yes | yes | yes — but never their own |
| `culturalSecretary`, `gameSecretary` | no — they see the accounts and change nothing | no | no |
| `member`, `volunteer`, `visitor` | no — they do not see the accounts at all | no | no |

Approving is not a separate permission: **any bearer can approve any entry except one
they recorded themselves.** You control who can approve by controlling roles.

So to let someone record and approve entries:

```bash
npm run user -- role --email person@example.org --role secretary
```

and to stop them:

```bash
npm run user -- role --email person@example.org --role member
```

Effective on their **next request** — no sign-out needed.

### Changing how many people are needed

Two knobs, both in `backend/src/config/constants.ts`, and both a code change plus a
deploy rather than a setting in the app:

- **`REQUIRED_APPROVALS`** — approvals needed **in addition to** whoever recorded the
  entry. `1` today, so two people in total. `2` would need three different people. `0`
  means recording posts immediately with no second pair of eyes at all — the wrong
  default for money, and not recommended.
- **`FINANCE_ROLES`** — the four roles that may always see the accounts and record
  entries. Remove `administrator` if the system's maintainer should not be able to move
  club money; that is a defensible choice and costs nothing. Widening this list does
  **not** need a code change — see *Letting somebody look without letting them act*
  below.

```ts
export const FINANCE_ROLES: readonly Role[] = ['treasurer', 'secretary', 'president', 'administrator']
export const REQUIRED_APPROVALS = 1
```

Whatever you set, the screens count it out for you — "needs 2 more approvals" — so
nobody has to remember the number.

These are deliberately not editable in the interface. A rule that decides how many people
must agree before the club's money moves should not be changeable by one person who is
having a busy afternoon — changing it leaves a commit with a date and an author.

**What you cannot do:** name a specific person as the only approver. The rule is
role-based on purpose, so that a single officer being away does not stop the club
recording money.

### Letting somebody look without letting them act

The Cultural Secretary and the Game Secretary organise the events the club spends its
money on. Seeing what it costs is reasonable; recording it is not their job. So they
ship with **read-only** access: they can open every screen in the office area — the
dashboard, the entries, the payments queue, the statements — and there are no buttons.
Where the buttons would have been, one sentence says why.

That is the browser being polite. The refusal is on the server: every route that changes
anything checks the role again and answers *You can see the club's accounts but not
change them*, so it holds whether the request comes from the club's screens or from
anywhere else.

Three states, then, and the club moves a role between them **without a code change** —
two variables on the API function in the Appwrite console → **Functions → `api` →
Settings → Variables**. They belong on the *function*, never on the site:

| State | How | What they get |
| --- | --- | --- |
| Full | name the role in `FINANCE_ROLES_FULL` | Records, approves, reverses, verifies payments |
| Read-only | name it in `FINANCE_ROLES_READONLY` — where both start | Opens every screen, presses nothing |
| None | leave it out of both | The member portal and nothing else |

To promote the Cultural Secretary, two variables, each one line:

| Key | Value |
| --- | --- |
| `FINANCE_ROLES_FULL` | `culturalSecretary` |
| `FINANCE_ROLES_READONLY` | `gameSecretary` |

**Put nothing else in the value.** No quotes, no `#` note about what it does — the whole
value is read as a comma-separated list of roles, so a trailing comment is one more word
that is not a role, and the promotion silently does not happen. Two roles at once is
`culturalSecretary,gameSecretary`.

Then **redeploy the function** — Functions → `api` → Deployments → the active one → ⋮ →
*Redeploy*. The setting is read once when the function starts, because a permission set
that changed halfway through somebody's session would be very hard to reason about, and a
container that is already warm keeps the old value until it is replaced. To put a role
back to looking only, move the word to the other variable and redeploy again. Whoever is
signed in sees the change on their next request; they do not need to sign out.

To check it took: ask them to open **Office → Entries**. *Record an entry* is there, or
it is not.

Two things the variables deliberately cannot do. They **cannot** take access away from
`treasurer`, `secretary`, `president` or `administrator` — a typo must not be able to
lock the club out of its own books. And they **cannot invent a role**: a word that is not
one of the club's roles is ignored and named in the function's log, because a silent typo
looks exactly like the feature not working.

### Doing it by hand, without the command line

Roles are Appwrite account **labels**. Appwrite console → **Auth** → the user →
**Labels** → set exactly one of `treasurer`, `secretary`, `president`, `administrator`,
`culturalSecretary`, `gameSecretary`, `volunteer`, `member`.

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

- the club's **letterhead** — logo, name, and the address and registration number if set
- the member, and **which months it covers**, in words
- the amount in a panel of its own, **and again in words**: *Rupees six hundred only*. Not
  decoration — it is the oldest anti-tampering device in bookkeeping, because a digit can
  be added to a figure and a sentence cannot, and every paper receipt a member has ever
  been handed carries it
- how they paid and the reference matched against
- the declaration and the ledger entry it produced, so it can be traced
- one signature line — **Verified and entered by** — naming the bearer who accepted it,
  left ruled for a hand signature, which is what a paper receipt needs

One line, because one bearer accepted it and the entry posted on their check. Printing
two — *Cashier* and *Approved by* with the same name in both — would claim a second check
nobody made. Where an entry genuinely did take a separate approval, the receipt prints
both names; and a receipt printed while its entry is still pending says *Awaiting a second
office bearer* rather than filling the line in. Both are read from the ledger at the
moment of printing, so receipts issued under the old two-signature rule stay truthful.

An officer can reprint any member's receipt from **Office → Members' payments** — the
commonest request an office ever gets.

### The verification code, and why a receipt number is not enough

Every number this system issues is **sequential** — `REF-2026-000012`, `RCT-2026-000004`.
That is deliberate: gapless numbering is what makes a set of books auditable, because a
missing number is a question somebody has to answer.

It is also guessable, and the club spotted the consequence. Anybody holding one genuine
receipt knows roughly where the counter is, and could put a plausible number on a document
the club never issued — for a payment never made, or for more than was handed over.

So every declaration also carries a **verification code** that cannot be guessed:

```
Verification code   PMV4-9WED-9A
```

- **Ten characters, drawn at random** from the operating system's random source — about
  300 trillion possibilities. It has no relationship to the reference number beside it.
- **Never issued twice.** The system checks its records before using one, and the database
  refuses a repeat outright, so it is a guarantee rather than a hope.
- **Allocated when the member declares the payment**, so it is on their acknowledgement
  before any money is confirmed, and on the receipt afterwards.
- **No I, L, O or U.** Those are the characters a tired reader confuses with 1, 0 and V
  when copying a code off a paper counterfoil.

**To check a receipt: Office → Members' payments → _Check a receipt's verification code_.**
Type the code off the document — hyphens, spaces and capitals do not matter, and O reads as
0 exactly as somebody would write it. The club gets back the member, the amount, the date
and the receipt number.

**Compare every figure against the paper.** A code that matches a real payment for a
*different amount* is precisely the forgery worth catching, and a green tick alone would
hide it. A code with no record behind it was not issued by this club.

Only office bearers can check codes. A member could otherwise try codes one after another
until one hit.

### Paying by UPI: the club's QR code

**Portal → Declare a payment → By UPI** shows a QR code and the UPI ID beneath it. The
member scans it, types the amount themselves — it depends how many months they are paying
for — and then records the transaction ID.

The QR is **generated from the UPI ID**, not a screenshot of somebody's payment app:

```bash
npm run upi:qr
```

That reads `club.upi` from `frontend/src/content/site.ts` and writes
`frontend/public/brand/upi-qr.svg`. **Run it again whenever the UPI ID changes** — a stale
QR sends money to the old account, silently, for as long as nobody scans it and reads the
name. Generating it means the QR and the printed ID cannot disagree, because both come from
the same line of one file.

Set the ID and the payee name in section 1 of `site.ts`:

```ts
upi: {
  id: 'someone@okaxis',
  payeeName: 'Sanjay Karmakar (Cashier)',
  qr: '/brand/upi-qr.svg',
  note: 'Paid to the club’s cashier.',
},
```

The payee name is printed under the QR with the instruction *"if your app shows any other
name, stop and tell an office bearer"* — which is the only protection a member has against
a swapped QR, and it only works if the name here matches what the payment app shows.

Leave `id` empty and the screen says UPI is not configured yet rather than showing a code
nobody can pay into.

> **On whose account this is.** Dues paid into an office bearer's personal account are that
> person's money as far as their bank is concerned, and the club cannot reconcile what it
> has no statement for. It works, and clubs do it — but a current account in the club's own
> name, with its own UPI ID, is worth the paperwork. When the club opens one, change `id`,
> run `npm run upi:qr`, and commit both.

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

- a **posted ledger entry** — dated the day the **member** paid, not the day you got round
  to it, and carrying your name as the bearer who accepted it. It is in the club's
  balances immediately: your check is the second pair of eyes, because the member put the
  money forward and you are not them
- a **receipt number**, which is what makes the member's download button appear, and which
  names you
- the **months are marked paid** in the register, if it was a membership payment

Nothing waits on anybody else. If you accept a payment that did not actually arrive, the
correction is a **reversal** — which does need one other bearer, like any entry an officer
writes.

### An officer cannot verify their own payment

A treasurer pays their subscription like everybody else. When they declare it, the
**Verify** button is not offered to them and the API refuses it — another officer has to
confirm it.

This is the check that matters, and it is why one bearer is enough: the question a
declaration asks is *did this money actually arrive*, and nobody can answer that about
their own payment.

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

### What the documents look like, and what they are called

Both the statement and a member's receipt carry the **club's letterhead**: the logo, the
club's name, and — if you set them — the address and registration number. The statement
names itself again at the top of every page after the first, because a statement handed
round a table arrives one page at a time, and page four with nothing on it but figures is
not identifiable.

To put the club's logo on them, run this once after changing the logo file:

```bash
npm run logo:pdf
```

It reads `frontend/public/brand/logo_web.png` and compiles a small copy into the API — the
PDFs are built by the server, which cannot reach the website's files. Until you run it, or
if the logo is missing, the documents print the club's initials in a ring instead, which
looks deliberate rather than broken.

The address and registration number come from two optional settings, because the API
cannot read the website's content file. Add them in the **Appwrite console** —
Functions → `api` → Settings → Variables — or in `backend/.env` locally:

```
CLUB_ADDRESS=Bhagini Nivedita Sarani, Nona Chandan Pukur, Barrackpore, Kolkata 700122
CLUB_REGISTRATION_NUMBER=50219
```

Leave them unset and the documents show the club's name alone — which is true. An address
nobody stated would not be.

**Filenames** lead with what the document is, then the period it covers:

```
Statement_2026-04_summary.pdf
Statement_2026-04-01_to_2027-03-31_detailed.pdf
Receipt_2026-06-11_RCT-2026-000004.pdf
```

A period that is exactly one calendar month is named as that month. The summary and the
detailed statement cover the same dates and show different totals, so which one it is
stays in the name — that is the confusion the whole scheme exists to prevent.

> **If a statement ever downloads as `statement.pdf` again**, the browser could not read
> the name the server sent. That name travels in a header called `Content-Disposition`,
> and a browser hides response headers from a page on a different origin unless the API
> says otherwise — which is exactly what happened to this club. The API now says
> otherwise, and the app also works the name out for itself from the period you chose, so
> it takes two failures rather than one. If you see it a third time, say so: it means a
> proxy in front of the site is stripping headers.

---

## 7. The club year, and carrying the balance forward

The club's year runs **April to March**. Each year's figures are its own: what it was
declared to start with, plus its own entries. Nothing from three years ago leaks in.

### Seeing a whole year, or one month of it

**Office → Dashboard** opens on **the whole club year** — the question a committee
meeting actually asks. Two dropdowns:

| | |
| --- | --- |
| **Club year** | 2026-27, and every year since the club started keeping books here |
| **Showing** | *The whole year*, or any single month of it |

Choose *The whole year* and every figure on the page covers 1 April to 31 March: income,
expenditure, the surplus or deficit, the bar chart month by month, and the fund table —
whose **Total** row now adds up across as well as down, so the year reads left to right
as *opened with, took in, paid out, holds*.

Choose an earlier year and you are reading a **closed** year. Nothing was archived away.
The heading says which twelve months you are looking at, and the first figure changes
from *Total held now* to *Held at the end*, with the date — because what the club held on
31 March 2027 is not what it holds today, and a committee reading last year's page should
not be told otherwise.

The period is in the address bar (`/office?year=2026-27`), so a year's figures can be
bookmarked, sent to another office bearer, or reloaded without losing your place.

**Office → Statements** takes the same choice — a whole club year, a month, or any two
dates — so the annual statement is one dropdown rather than a date range typed twice.

### Two ways to close a year

**Whenever the meeting happens: Office → Club years.** Choose
*Summarise a year and start the next*. This is the route to use when the committee has
just adopted the figures — you do not have to wait to be prompted, and nothing has to be
run from a terminal.

**Or wait to be asked: Office → Dashboard.** For eleven months of every twelve there is
nothing there. On 1 April, when the calendar moves into a year the club has not opened
yet, a panel appears at the top:

> **A new club year has begun — 2027-28**
> Close 2026-27 by saying what the club is carrying into 2027-28.

Either route shows the same thing: **the year summarised**, then the figures to adopt.

| | |
| --- | --- |
| 2026-27 opened with | what it started the year holding |
| Income | everything taken in across the year |
| Expenditure | everything paid out |
| Left at 31 March | what the books say is there now |

Print the **detailed statement** for that period if the committee wants the entries
listed.

The per-fund figures underneath are filled in with what the books say each fund held on
31 March. **Those are a suggestion, not the answer.** Count the cash box, read the bank
statement, and change anything that does not match — that is what a year end is for.

If the adopted figure differs from the books, the panel says by how much and asks for a
note. **Both figures are kept.** The difference is the interesting part, and a system
that quietly replaced one with the other would destroy the only evidence that a count
ever happened.

The panel also warns if entries in the year being closed are still awaiting approval —
they are not in the figures, and once the year is closed they cannot be added to it.

### What closing a year does

Opening 2027-28 **closes 2026-27**:

- 2027-28's figures start from the balances you adopted, not from the club's whole
  history
- **nothing can be dated into 2026-27 any more.** Try it and the entry is refused,
  naming the year and telling you what to do instead

That second rule is the point. Without it, an entry added after the meeting would make
the carry-forward the committee adopted stop matching the year it came from — silently,
with nothing on any screen showing the difference.

### Money that arrives late

A member pays their 2026-27 subscription in June 2027, after the year is closed. Nothing
is refused and nothing is lost:

- the **entry** is dated 1 April 2027 — the first day the books are open, which is when
  the club actually received the money — and its description records the date they
  really paid, marked *arrears*
- the **months** are still credited to 2026-27, so the member's register for that year
  fills in and their receipt names the right months

So the arrears carry forward into the open year, which is where the cash is.

### Reopening a year

**Office → Club years** lists every year the club has, newest first: what it was started
with fund by fund, who adopted it, how it compared to the books, the note they left, and
whether it is closed. Every year has a **See the whole year** link straight to its
figures. A closed year stays readable to every office bearer for good — closing settles a
year, it does not hide it.

Adopted the wrong figures? **Reopen** the year. The one before it becomes editable
again; correct it and close it once more. Reopening is recorded in the audit trail, as
is every opening — including the difference between what the books said and what the
committee adopted.

A year that has **not begun** cannot be opened. Opening 2027-28 closes 2026-27, so doing
it in the middle of 2026-27 would settle the year the club is living in and refuse every
entry for the rest of it.

Which is why, for most of the year, **Office → Club years** shows the next year's opening
balance rather than a button: the date it can be started, the figure that would carry into
it, and that figure fund by fund, on the books as they stand today. The treasurer can
check through the year that the carry-forward building up looks right, and on 1 April the
same page is where the committee's adopted figures are entered.

### Which years the pickers offer

Every year list in the system — the membership register, the dashboard, the statements —
runs from **2026-27**, the year the club started keeping books here, up to the year it is
in. Never earlier, because there is nothing to show; never later, because a year that has
not begun has no figures and must not be closable.

To change where the club's records begin, edit `FIRST_FINANCIAL_YEAR` in
`backend/src/config/constants.ts` **and** the identical block in
`frontend/src/config/constants.ts`.

### If a member leaves

Deleting somebody's account removes their sign-in. **It does not remove their money.**

- their ledger entries stay exactly where they are — the club has the cash, and an entry
  that vanished would leave the accounts short with nothing explaining it
- their receipts and payment records stay
- they stay on the **membership register**, marked *Former member*, showing what they
  paid

What they did not pay stops being a debt: a former member is never shown as overdue and
never appears under "Still owing". They are still under "Everyone", because their money
is still in the totals.

Prefer `npm run user -- disable` to deleting — see §1. It keeps the account and the
audit trail intact and can be undone.

---

## 8. Testing it end to end

Sign in at <https://newmilanisanghaclub.appwrite.network/login>.

| Step | Expect |
| --- | --- |
| Choose **Office bearers**, sign in as the treasurer | Lands on `/office`; **no** amber "Sample data" bar |
| Office → Entries → record an income entry | Saved as **pending**, and the message says *needs 1 more approval*; the dashboard figures do **not** move |
| Try to approve it yourself | Refused — you recorded it. The row says *1 approval outstanding* and that any other bearer can give it |
| Try to edit it | There is no edit anywhere. Withdraw it instead, or reverse it once posted |
| As the secretary: approve it | Posts on that **one** signature — no third person is asked for — and the figures move |
| Cancel it by reversal | A pending reversal appears; once one other bearer approves it, the original shows `reversed` and the total returns to where it was |
| Sign out | Returns to the sign-in page, and going back to `/office` asks you to sign in |
| Statements → download **both** PDFs | Two files; the summary has no entry list, the detailed one does, and both names carry the period and today's date |
| Sign-in page → Reset password | Email arrives; its link opens the new-password page |
| Choose **General members**, sign in as a member | Lands on `/portal`; `/office` explains it is not available to them |
| Try the **Office bearers** door with that member's account | Refused, and told to use the General members entrance |

Then the membership flow, which crosses both areas:

| Step | Expect |
| --- | --- |
| As a member: My membership | Twelve boxes, all unpaid; "0 of 12 months paid", ₹600 outstanding |
| Declare a payment — click June, then click August | The three months highlight and the amount reads ₹150; there is no box to type an amount into |
| Click "The rest of the year" | All twelve highlight at ₹600, the yearly rate |
| Send it | An acknowledgement `REF-…`, listed as *Awaiting verification* |
| Look at the twelve boxes again | Still unpaid — a declaration is not money until it is verified |
| Try to declare the same month again | Refused, naming the month and the reference already claiming it |
| Try "the rest of the year" | Priced at ₹550 for the remaining 11 months |
| As the treasurer: Office → Members' payments | Listed, with the UPI transaction ID to match against |
| Verify it, choosing a fund and category | Entered as `TXN-…` **posted** — the club's figures move at once, with no second approval to give; a receipt number `RCT-…` is issued |
| Office → Membership register | That member shows 1 of 12, one green box, and the rest red or grey |
| Back as the member: **Download receipt** | A PDF naming the month, with one signature line — *Verified and entered by* — carrying the treasurer's name |
| Try to approve that entry as the secretary | Refused: there is nothing left to approve |
| As the treasurer: declare a payment of your own | Office → Members' payments offers no **Verify** button for it, and says another officer must |

And the year end, which you can try at any time without waiting for April:

| Step | Expect |
| --- | --- |
| Office → Club years | Every year the club has, and — until 1 April — what would carry into the next one |
| Office → Dashboard, **Showing → The whole year** | The whole of 1 April to 31 March in every figure, and `?year=` in the address bar |
| Post an entry, then open next year from the dashboard panel | It is only offered once the calendar has passed 31 March; until then, check the panel is absent |
| After opening a year, try to record an entry dated in the closed one | Refused, naming the year and saying to date it when the money arrived |
| Record a member's payment whose paid-date is in the closed year | Entered on 1 April of the open year, described as *arrears*, with the member's months still credited to the year they paid for |
| Club years → Reopen | The year before becomes editable again |

The amber **Sample data** bar appearing anywhere means the API has lost its database
credentials and is serving the demo ledger. Check with:

```bash
npm run appwrite:check
```

---

## 9. When something does not work

| Symptom | Cause |
| --- | --- |
| "Could not reach the club's server" | The site cannot reach the API. Check `npm run appwrite:check`, and that `CORS_ORIGINS` on the function lists the site's domain |
| Changing the month on the dashboard showed an error | Fixed. The month box used to be a native date field, which **Safari does not support** — it became a text box, so the first character typed was sent as the month and the API refused it. It is now two dropdowns, **Club year** and **Showing**, which cannot produce a value the server rejects. If you still see it, the browser is holding an old copy: reload the page |
| Sign-in or sign-out does nothing at all | The site's domain is not a registered **Web platform**: Appwrite console → your project → Settings → Platforms. Appwrite refuses browser calls from unlisted origins, silently as far as the app can tell |
| A reset link goes to "Page not found" | An old build. The `/reset-password` route was added later; redeploy the site |
| Entries cannot be recorded | No funds or categories. See section 3 |
| An entry will not post | The two-person rule. See section 4 — you need a second officer account |
| Amber "Sample data" bar | The API has no database credentials; it is showing the embedded demo ledger |

---

## 10. Where the club's data actually lives

Nothing sensitive is in GitHub, and a check now enforces that.

| What | Where it lives | In GitHub? |
| --- | --- | --- |
| Member names, emails, roles | **Appwrite → Auth** | No |
| Passwords | **Appwrite, hashed.** Not readable by anyone, including you | No |
| Member ids | **Appwrite → Auth** (`npm run user -- list`) | No |
| Funds, categories, the ledger | **Appwrite → Databases** | No |
| Members' declared payments | **Appwrite → Databases** (`payments`) | No |
| Year-end carry-forward figures | **Appwrite → Databases** (`finance_years`) | No |
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

## 11. Back up before you rely on it

```bash
bash scripts/backup-to-drive.sh                  # the one to run: Drive + a readable copy
npm run backup                                   # or locally: backups/<timestamp>.json
npm run restore -- --file backups/<file>.json    # checks it; --write to restore
npm run export:book -- --file backups/<file>.json   # a spreadsheet from any backup
```

Appwrite's free plan takes no backups of its own. **Check every backup you take** —
`restore` without `--write` validates the file in seconds. An untested backup is a
guess, and a club's membership and payment history is not reconstructible from anywhere
else. Detail in [10-appwrite.md § Backups](10-appwrite.md#backups).

### Into Google Drive

```bash
bash scripts/backup-to-drive.sh
```

Install **Google Drive for Desktop** and sign in; that is the whole setup. Drive syncs an
ordinary folder, so a backup reaches Drive by being written into one — no API key, no
service account, no OAuth token to expire unnoticed. The script finds
`~/Library/CloudStorage/GoogleDrive-<your-email>/My Drive` by itself and writes into
**Milani Sangha Club backups**.

Somewhere else instead — an external disk, a different synced folder:

```bash
BACKUP_DIR="/Volumes/Backup/club" bash scripts/backup-to-drive.sh
KEEP=90 bash scripts/backup-to-drive.sh          # keep 90 copies instead of 30
```

It keeps the newest 30 and deletes the rest — **by count, not by age**, deliberately:
pruning by age empties the folder if backups stop running, which is exactly when the old
ones become precious.

**Two files arrive for each backup:**

| File | What it is for |
| --- | --- |
| `2026-08-05T17-40-39-795Z.json` | Putting the data **back** into Appwrite. Not readable by a person |
| `2026-08-05T17-40-39-795Z-books.xlsx` | **Reading** the club's books with no server and no sign-in |

### Reading the books when the site is down

This is the question worth having an answer to before it happens, and the answer must
not be "restore the database and redeploy the application" — nobody does that on the
evening before an AGM.

Open the **spreadsheet**. Any backup can produce one:

```bash
npm run export:book -- --file backups/2026-08-05T17-40-39-795Z.json
```

It writes `<backup>-books.xlsx` beside the backup, and Excel, Numbers, LibreOffice and
Google Sheets all open it offline:

| Sheet | |
| --- | --- |
| **Summary** | Each fund's opening balance, what came in, what went out, what is left, and the total held |
| **Entries** | Every ledger entry, with its fund, category, who recorded it and who approved it |
| **Member payments** | Every declaration: member, amount, months, receipt number and verification code |
| **Funds**, **Categories**, **Accounts** | The chart of accounts and who has an account |

The summary is computed by **the same code as the printed statement**, so the two cannot
disagree. Amounts are in rupees, not paise, so a column adds up in the spreadsheet.

Three habits worth keeping, in order of how much they help:

1. **`bash scripts/backup-to-drive.sh` on a schedule** — cron or launchd, weekly. Both
   files land in Drive, so any committee member with the folder shared to them can read
   the books from a phone.
2. **Download the year's PDF statement after each committee meeting** (Office → Statements
   → the club year → both PDFs) and keep it in the same Drive folder. A signed statement
   is the club's record; a spreadsheet is a working copy.
3. **Validate one backup a month**: `npm run restore -- --file <the newest>`. It writes
   nothing and takes seconds.

What none of this gives you is the *application* offline: the member portal and the
officer screens need the API, and the API needs Appwrite. The website's pages are cached
by the browser and will still open, but the figures come from the server. Reading the
books offline is the spreadsheet and the PDFs — which is what a club actually needs when
the internet is out.

---

## 12. The website's contact form

**Office → Enquiries.** A visitor fills in *Send an enquiry* on the contact page, and the
message appears on that screen. It stays there until somebody marks it dealt with and says
what was done.

### The list is the record; email is only a notification

The club asked for this and was right to. An emailed enquiry depends on things nobody at
the club controls — an app password that expires, 2-step verification switched off, a
message filed as spam — and each of those loses a message **silently**, with the person who
wrote it having no way to know. So an enquiry is written to the club's own records first,
and the visitor is told it arrived only because it did. Email still goes out when it is set
up, carrying the same reference, but if it fails the enquiry is already safe.

Nothing has to be configured for this to work. **Set up email or don't — enquiries arrive
either way.**

### Who can see them

**The secretary and the president only.** Not the treasurer, and not an ordinary member: an
enquiry is not a financial record, and it carries a stranger's name, address and telephone
number. The menu shows *Enquiries* only to those two, and the server refuses everybody
else — a treasurer who follows a link is told who to ask rather than getting an error.

An administrator who needs access can give themselves the `secretary` role, which is a
change with a name against it in the audit trail. That is the right shape for this: nobody
reads the club's post by accident.

### Dealing with one

| | |
| --- | --- |
| **To answer** | What nobody has dealt with yet. The count also appears on the office dashboard |
| **Mark dealt with** | Asks for a note — *what was done*. Optional, and worth writing: six months later "resolved" on its own tells the next secretary nothing |
| **Not finished after all** | Puts it back in the open list. The note is kept, because it is still a record of what happened |
| **Delete** | Removes the message and the person's details for good. For spam, and for enquiries the club has finished with |
| **The email address** | A link. Clicking it opens a reply with the subject and reference already filled in |

Two officers cannot overwrite each other: the second one to press *Mark dealt with* is told
the first already did, rather than quietly replacing their note.

### How much of the club's database this uses

Every field is capped, because the contact form is the one place a stranger can write into
the club's database:

| Field | Limit |
| --- | --- |
| Message | **1000 characters** — about 150 words |
| Name | 80 · Email 120 · Phone 20 · Subject 120 |
| The office's note | 500 |

A thousand characters is roughly a kilobyte, so ten thousand enquiries would be about ten
megabytes — a rounding error against the free tier. The caps exist so that somebody pasting
a novel, or a bot pasting a dictionary, cannot make it otherwise. **Deleting** finished
enquiries is how the club keeps the table small, and it is also how a stranger's details
stop being held once they are of no further use.

Ten submissions per quarter of an hour per visitor, and a hidden field that bots fill in
and humans cannot see — those submissions are accepted politely and thrown away.

### Email notifications, if you want them

Optional. With them, the secretary gets a copy in Gmail the moment an enquiry arrives
instead of having to look at the screen. Without them, nothing is lost — the message is
still on the Enquiries page.

### Setting it up with Gmail

The club's address is a Gmail account, so Gmail sends the mail. It needs an **app
password** — a 16-character password for one application, which can be revoked on its own
without touching the account:

1. That Google account must have **2-Step Verification** switched on. App passwords do not
   exist without it: <https://myaccount.google.com/signinoptions/two-step-verification>
2. Go to <https://myaccount.google.com/apppasswords>, name it *Club website*, and copy the
   16 characters it shows once.
3. Put these in the **Appwrite console**, on the API function:
   **Functions → `api` → Settings → Variables**. They belong on the *function*, never
   on the site — a build variable would be compiled into the browser bundle.

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=<the club’s Gmail address>
   SMTP_PASSWORD=the 16-character app password
   MAIL_FROM=New Barrackpore Milani Sangha Club <the club’s Gmail address>
   CONTACT_TO=<the same address>
   ```

4. Redeploy the function, or wait for the next push. Variables are read when the
   function starts, so a running deployment will not pick them up on its own.

For local testing put the same lines in `backend/.env`.

**`SMTP_PASSWORD` is a credential.** It belongs on the Appwrite function and in
`backend/.env` — never in `site.ts`, never in a commit, never pasted into a chat or a
ticket. If it leaks, revoke
that one app password on the account and make another; nothing else is affected.

### The four things worth knowing

- **`CONTACT_TO` is where enquiries go, and it is not in the form.** A form that carried
  its own recipient would be an open mail relay, and automated scanners find those within
  days. Keep it the same as `club.contact.email` in `site.ts` — that is the address printed
  on the page, and a visitor told one address while the message goes to another has been
  misled.
- **`MAIL_FROM` must be the club's own address**, not the visitor's. Sending as somebody
  else's address is what spam does; Gmail would fail its own SPF check and the message
  would land in spam or be refused. The visitor's address goes in **Reply-To**, so hitting
  reply in Gmail answers the person who wrote.
- **Ten submissions per quarter of an hour, per visitor.** The same limit sign-in uses.
- **There is a hidden field bots fill in.** A submission carrying it is answered politely
  and thrown away, because telling a robot it was detected only teaches it to try again
  differently.

### If a visitor reports that nothing happens

The form now always says something — a green confirmation or a red explanation. If a
visitor sees neither, the request never left their browser. If they see the red one, the
words are the server's own and say what to do. To check it yourself:

```bash
curl -i -X POST https://<the site>/api/v1/contact \
  -H 'content-type: application/json' \
  -d '{"name":"Test Person","email":"you@example.org","subject":"Test",
       "message":"Checking that the club contact form still works."}'
```

`201` means it was sent. `503 mail_not_configured` means the variables are missing on
the function, or it has not restarted since they were added. `502 mail_failed` means Gmail
refused the credentials — almost always an app password that was revoked, or 2-Step
Verification switched off on that account.

