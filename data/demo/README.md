# Finance import templates

Three spreadsheets that **seed the demonstration data** for the officer finance
area. When the API starts without Firebase credentials it loads these files, so the
dashboard and the statements have realistic figures to show.

> **There is no import screen.** It was removed at the club's request — entries are
> recorded by hand in **Office → Entries**, each needing a second officer's
> approval. These files remain the seed for the demo, and the format the loader
> understands if the club later wants its historical figures brought in.

The loader reads them **in this order**, because transactions refer to funds and
categories by name:

1. `funds.csv` — where the club's money is held
2. `categories.csv` — the income and expenditure headings
3. `transactions.csv` — the entries themselves

## Rules that apply to all three

| | |
| --- | --- |
| **Dates** | Always `YYYY-MM-DD`. `2026-04-15`, never `15/04/2026` |
| **Amounts** | Rupees. `1500`, `1500.50`, `1,500.50` and `₹1,500.50` are all accepted. At most two decimal places — the import refuses `10.999` rather than rounding it |
| **Column order** | Does not matter. Extra columns are ignored. Header spelling and case do not matter (`Amount`, `amount` and ` AMOUNT ` are the same) |
| **Blank rows** | Ignored |
| **Encoding** | Save as CSV UTF-8. A byte-order mark from Excel is handled |

**Nothing is loaded unless every row is valid.** If one row has a problem the
whole file is rejected and you get a list of every error with its line number, so
you can fix the spreadsheet in one pass. A half-imported cash book cannot be
reconciled, and you would have no way of telling which half arrived.

## funds.csv

| Column | Required | Notes |
| --- | --- | --- |
| `name` | yes | Must be unique. This is the name you use in `transactions.csv` |
| `kind` | yes | One of `cash`, `bank`, `upi`, `other` |
| `opening_balance` | yes | The balance **before** your first imported transaction |
| `opening_date` | yes | The date that opening balance was taken |
| `active` | no | `no` hides it from new entry forms. Defaults to `yes` |
| `notes` | no | For your own reference |

Get the opening balances right: every closing balance in every report is the
opening balance plus what follows. If they are wrong, every figure is wrong.

## categories.csv

| Column | Required | Notes |
| --- | --- | --- |
| `name` | yes | Unique within its kind |
| `kind` | yes | `income` or `expense` |
| `active` | no | Defaults to `yes` |
| `notes` | no | |

The same name may exist as both an income and an expense heading — "Events" is
commonly both.

## transactions.csv

| Column | Required | Notes |
| --- | --- | --- |
| `date` | yes | `YYYY-MM-DD` |
| `kind` | yes | `income`, `expense` or `transfer` |
| `amount` | yes | Always positive. Direction comes from `kind` |
| `fund` | yes | Fund name. Money **into** this fund for income, **out of** it for expense and transfer |
| `to_fund` | transfers only | Destination fund. Must differ from `fund` |
| `category` | income and expense only | Must match a category of the same kind. Leave blank for a transfer |
| `source` | yes | Where the money came from or went to, in your own words — "Ward 12 collection drive", "Bose Hardware". This drives the "collections by source" report |
| `description` | yes | A short line explaining the entry |
| `reference` | no | Cheque number, UPI reference, bill number |

### A transfer is not income or expenditure

Moving cash to the bank does not change how much the club has. A `transfer`
therefore reduces one fund and increases another, and is reported separately from
income and expenditure so it never inflates either figure.

## What the loader does with them

Seeded entries are treated as already approved, so the dashboard has figures on a
first look. One entry is deliberately left **pending** so the approval queue is not
empty and the two-person rule can be tried straight away.

Anything the club records afterwards goes through the normal flow: recorded by one
officer, approved by a different one.

## The sample data

The rows shipped here are **illustrative**, covering April and May 2026 with
income, expenditure and transfers across four funds, so the dashboard and the PDF
statement have something realistic to show. Delete them before entering the club's
real figures — or import them into a test project first to see how the reports
look.
