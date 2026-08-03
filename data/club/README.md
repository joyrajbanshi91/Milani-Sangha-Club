# The club's real finance data

Loaded into Firestore with:

```bash
npm run seed:finance -- --dir ../data/club            # checks, writes nothing
npm run seed:finance -- --dir ../data/club --write    # applies it
```

Column reference: [../demo/README.md](../demo/README.md).

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
