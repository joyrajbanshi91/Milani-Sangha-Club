# The member area and the club finances

Two areas behind one sign-in:

| Area | Who | What they see |
| --- | --- | --- |
| **`/portal`** — My membership | Every signed-in member | Profile picture, membership status, paying dues **by UPI or in cash**. **No financial information at all** |
| **`/office`** — Club finances | President, secretary, treasurer, administrator | Dashboard, manual entries, approvals, PDF statements |

## Paying dues: UPI or cash

The member chooses the method, and both end the same way — **the treasurer confirms
it against the club's records before any receipt exists.**

| | |
| --- | --- |
| **By UPI** | The member pays from their phone and enters the transaction ID, quoting the reference number so the treasurer can match it |
| **In cash** | The member hands the cash to an office bearer, then records the amount, the date and **which officer took it** |

Cash is the case worth being careful about: there is no bank record to check
against, so the officer who received it must also enter it into the books, which
needs a second officer's approval like any other entry. The portal tells the member
to ask for an acknowledgement at the time.

---

## Trying it now

```bash
npm run dev
```

Open <http://localhost:5173/login>. No Firebase project is needed — the API runs a
**demonstration mode** with four fixed accounts and the sample data from
`data/demo/`:

| Account | Role | Sees the finances |
| --- | --- | --- |
| `treasurer@demo.club` | treasurer | yes |
| `secretary@demo.club` | secretary | yes |
| `president@demo.club` | president | yes |
| `member@demo.club` | member | **no** |

**To see the two-person rule**: sign in as the **treasurer**, record an entry, and
try to approve it — you will be refused. Sign out, sign in as the **secretary**,
and approve it. Only then does it appear in the figures.

**To see the boundary**: sign in as the **member** and try
<http://localhost:5173/office>. The page refuses, and so does the API.

Demonstration mode has **no passwords** and keeps everything in memory, so it
resets when the API restarts. It refuses to start at all when `NODE_ENV` is
`production`.

---

## How money is handled

### Amounts are integers, in paise

`₹1,500.50` is stored as `150050`. Rupees are never added as decimals anywhere,
because `0.1 + 0.2 !== 0.3` in binary floating point and a ledger that drifts by
paise is a ledger nobody can reconcile. The import refuses `10.999` rather than
rounding it to `11.00`.

### The two-person rule

No single person can move the club's money:

1. An officer **records** an entry. It is `pending` and affects **no** balance.
2. A **different** officer **approves** it. Only then is it `posted` and counted.
3. The person who recorded it **cannot** approve it. The server refuses — it is not
   a hidden button, it is a rejected request.
4. Approvals must come from distinct people. Approving twice does nothing.

To require three signatures instead of two, change `REQUIRED_APPROVALS` in the
shared constants.

### Nothing is ever deleted

A posted entry is never edited or removed. Cancelling one **posts an equal and
opposite reversal**, which itself needs a second officer, and the original stays
in the ledger marked `reversed` with a pointer to its reversal. Undoing a payment
is exactly as hard as making one, and the ledger remains a record of what was
decided and when.

A `pending` entry that nobody has approved yet can be **withdrawn** by its author —
nothing was decided, so nothing needs a trail. Once another officer has signed, that
option disappears.

### Statuses

| Status | Meaning |
| --- | --- |
| `pending` | Recorded, awaiting a second officer. Counted nowhere |
| `posted` | Approved. **The only status that affects a balance** |
| `rejected` | A second officer declined it, with a reason |
| `discarded` | Withdrawn by its author before anyone approved |
| `reversed` | Was posted, then cancelled by an approved reversal |

---

## The dashboard

Opens on **the whole club year**, and *Showing* narrows it to a single month. The **Club
year** dropdown reaches every year the club has kept, closed years included, and the
chosen period is held in the address bar (`/office?year=2026-27`) so it can be bookmarked
and shared.

- **Total held** across every fund, and each fund's opening, in, out and balance — with a
  total row that adds up across as well as down. For a period that has ended, this reads
  *Held at the end*, with the date, rather than *Total held now*
- **Income, expenditure and the surplus or deficit** for the chosen year or month
- **Income and expenditure by category**, with shares
- **Collections by source** — the "where did the money come from" view, as a chart
  and a list
- **Month-by-month** income against expenditure
- **Warnings first**: entries awaiting approval, and any fund whose balance has
  gone below zero

Two figures are deliberately prominent because they usually mean a mistake:

- **Pending entries** are listed and excluded from every figure, with a note saying so.
- **A fund below zero** is flagged in red. It is not blocked when recorded — a bank
  account can genuinely be overdrawn, and entries are often keyed in out of order —
  but a cash box cannot hold less than nothing, so it almost always means a wrong
  amount, a missing opening balance, or a spreadsheet imported twice.

---

## Recording entries

**Office → Entries → Record an entry.** Income, expenditure or a transfer between
two funds. Amounts accept `1500`, `1500.50` or `1,500.50`; the date cannot be in
the future, though backdating is allowed.

Each entry is saved as **pending** and appears in the approval queue for the other
officers. The person who recorded it sees a "withdraw" button instead of
"approve" — the interface says why, using the same rule the server applies.

There is **no CSV import screen**. It was removed at the club's request, and the
endpoints went with it so a stale browser tab cannot bulk-post into the ledger.
The demonstration figures are still seeded from
[data/demo/](../data/demo/) when the API starts without Firebase credentials.

---

## Members' profile pictures

**Portal → Profile picture.** Add, change or remove it.

Large photographs are **cropped square and resized to 512px in the browser** before
upload: a phone photograph is several megabytes and the app shows it at 96px, so
uploading the original would cost the member data for no visible benefit. The
server validates the type and size again — the browser-side resize is a courtesy,
not a control. SVG is refused, because an SVG can carry script.

Pictures are stored on the member's own record, readable only by them and the
office bearers. There is deliberately no `/members/:uid` route: the only profile
anyone can reach is their own.

---

## Statements

**Office → Statements.** Choose a whole club year, a month of it, or any date range;
view it on screen, and download it as a PDF. A club year and a month come from the same
pair of dropdowns as the dashboard, so an annual statement takes one choice rather than
two dates typed by hand.

The PDF contains the summary, every fund's movement, income and expenditure by
category, collections by source, payments by recipient, the full list of entries,
and a signature block for the treasurer, secretary and president to sign when the
committee adopts it.

The screen and the PDF are built from the **same** function, so the printed
statement can never disagree with what the officer saw.

Two checks appear on the face of the statement rather than being buried:

- **It reconciles**: opening + income − expenditure must equal the closing balance.
  If it does not, the difference is printed with a likely cause.
- **Pending entries and overdrawn funds** are called out, so nobody signs a
  statement without knowing what is missing from it.

---

## Club years

**Office → Club years.** Where a year is started with the opening balance the committee
adopted, and where every year the club has kept can be read back.

- **Starting the next year** — the year-end form, whenever the meeting happens. It
  summarises the year being closed (opened with, income, expenditure, what is left),
  fills the per-fund figures in from the books as a *suggestion*, and asks for a note
  when the adopted figures differ. Both figures are kept: the difference is the evidence
  that a count happened.
- **Before 1 April** the same page shows what *would* carry into the next year, fund by
  fund, and the date it can be adopted. A year that has not begun cannot be opened —
  opening 2027-28 closes 2026-27, and doing that mid-year would freeze the books the club
  is still writing in.
- **Every year the club has**, newest first: what it opened with, who adopted it, how it
  compared to the books, their note, whether it is closed, and a link to its figures in
  full. Closing a year settles it; it does not hide it, and every office bearer can read
  a closed year for good.

It has its own place in the navigation because a treasurer goes looking for it. As a panel
at the foot of the statements page it could not be found, and for eleven months of every
twelve all it said was that there was nothing to do.

---

## Why a member cannot see any of this

Three independent locks:

1. **The interface** never shows a member a link to the finance area.
2. **The API** refuses: `requireFinanceOfficer` returns 403 for every finance and
   report route. The role comes from the verified token, never from the request —
   a client cannot claim to be the treasurer.
3. **Firestore rules** refuse: the `finance_*` collections are readable only by an
   officer role, and **writable by nobody** from a client. All financial writes go
   through the API, because the two-person rule, gapless reference numbers and the
   audit trail cannot be expressed in a security rule.

The tests in `backend/tests/financeApi.test.ts` assert this boundary — every
finance route, for both reads and writes, with and without a token — and also that
the refusal message leaks nothing about the figures behind it.

---

## Going live with real data

Everything above works today on the in-memory demo store. To move to a real
database:

1. Create a Firebase project and configure Admin credentials —
   [03-environment-variables.md](03-environment-variables.md#firebase-admin).
2. Restart the API. It switches to Firestore automatically, and the demo sign-in
   is refused from that point.
3. Deploy the rules and indexes:
   `firebase deploy --only firestore:rules,firestore:indexes`
4. Grant the office bearers their roles. Roles live in Firebase Auth **custom
   claims**, which only the server can set — `AuthService.setRole(uid, role)`.
   A small bootstrap command for the first administrator is still to be written.
5. Import the club's real `funds.csv` and `categories.csv`, then its transactions.

**Get the opening balances right before anything else.** Every closing figure in
every report is the opening balance plus what follows it.

---

## What is not built yet

Honest list, so nothing here is a surprise:

- **Membership records themselves** — number, category, validity, renewals. These
  need the club's six decisions (membership year, fee per category, family
  structure, member-number year, grace period, retention). The portal shows the
  fields as "to be confirmed" rather than inventing them.
- **The UPI payment flow is a shell.** The form validates and shows the intended
  sequence, but stores nothing: there is no payments collection yet. It says so on
  screen rather than pretending to have saved.
- **Receipts, membership cards** — follow the payments module.
- **A first-administrator bootstrap command** for granting the initial role claims.
- **Rules tests against the emulator.** The rules are written and deployed as code
  but are not yet covered by automated tests; the API boundary is.
- **Editing and deactivating funds and categories** from the interface. They can be
  created, and imported from CSV.
