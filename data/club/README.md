# The club's real finance data

Loaded into the configured store — Appwrite or Firestore — with:

```bash
npm run seed:finance -- --dir ../data/club            # checks, writes nothing
npm run seed:finance -- --dir ../data/club --write    # applies it
```

Column reference: [../demo/README.md](../demo/README.md).

> **These files once held a copy of `data/demo/`.** All three were byte-identical to
> the demo ledger — invented opening balances of ₹5,000 and ₹45,000, and twenty-five
> fabricated transactions naming real-sounding suppliers. Seeding that into the
> club's own database would have made every closing figure in every report wrong, and
> put fiction in the audit trail. `funds.csv` and `transactions.csv` have been
> emptied back to their headers, which is what the section below always said they
> were. `categories.csv` was left as it is: headings carry no money.
>
> The demo ledger still exists, unchanged, in `data/demo/` — that is what the site
> shows when no database is configured.

## funds.csv is intentionally empty

A fund carries an **opening balance**, and every closing figure in every report is
that opening balance plus what follows it. A guessed number would make every later
figure wrong, so nothing was invented here.

Add one row per place the club keeps money — with the balance as it stood on the
date you give:

```csv
name,kind,opening_balance,opening_date,active,notes
Cash box,cash,4820.50,2026-04-01,yes,Held by the treasurer
Bank account,bank,63400,2026-04-01,yes,Current account
Club UPI,upi,0,2026-04-01,yes,UPI collections
```

`kind` is one of `cash`, `bank`, `upi`, `other`.

Get these right before recording any entry. Re-running the seed skips funds that
already exist **by name**, so a mistake is easier to avoid than to correct.

## categories.csv

Pre-filled with a general set of club headings. Delete what does not apply and add
what does — they carry no money, so they are safe to change at any time.

## transactions.csv is empty too, and should usually stay that way

Only loaded when you pass `--with-transactions`, so an accidental seed cannot post
entries. Leave it empty unless you are deliberately importing a historical ledger the
club has actually reconciled.

The normal way to start is to set each fund's opening balance to the figure as it
stood on a chosen date, then record everything from that date onwards through the
officer area, where the two-person approval and the reference sequence apply. History
before that date is *represented* by the opening balances rather than re-entered —
which is also how a treasurer would hand over a set of books on paper.
