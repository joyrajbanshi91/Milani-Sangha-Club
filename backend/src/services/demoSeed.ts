/**
 * The demo ledger, embedded in the source rather than read from disk.
 *
 * ## Why this is not just `readFileSync('data/demo/funds.csv')`
 *
 * It was, and that is precisely what broke the deployment. The demo store seeded
 * itself by resolving `import.meta.dirname` up three levels to `data/demo`, which
 * is correct when the API runs as `backend/dist/services/container.js` on a real
 * filesystem. Inside a deployed function it is not: the bundler flattens the whole
 * backend into one bundled file in a different directory, so the relative path
 * points nowhere, and `data/` is not part of the function's payload in any case.
 * The seed threw, the container threw, and every route answered 500 — including the
 * health endpoint whose job is to explain why.
 *
 * Embedding the three spreadsheets removes the failure mode rather than working
 * around it. There is no path to resolve, no file to ship and nothing that behaves
 * differently once bundled. All three together are under 4 KB, so the cost is
 * nothing next to a deployment that cannot start.
 *
 * ## The copy in data/demo/ is still the source of truth
 *
 * Those files are what the club edits and what `npm run seed:finance` imports, so
 * they stay. `tests/demoData.test.ts` asserts the two are identical and fails if
 * either is changed alone — the drift this kind of duplication invites is caught by
 * the build rather than discovered by someone whose demo data no longer matches the
 * template they were given.
 *
 * To change the demo ledger: edit `data/demo/*.csv`, run `npm test`, and paste the
 * new contents here when the test tells you they disagree.
 */

export const DEMO_FUNDS_CSV = `name,kind,opening_balance,opening_date,active,notes
Cash box,cash,5000,2026-04-01,yes,Petty cash held by the treasurer
Bank account,bank,45000,2026-04-01,yes,Current account at the branch
Club UPI,upi,0,2026-04-01,yes,Collections received by UPI
Festival fund,other,12000,2026-04-01,yes,Ring-fenced for the annual programme
`

export const DEMO_CATEGORIES_CSV = `name,kind,active,notes
Membership fees,income,yes,Annual and life subscriptions
Donations,income,yes,From members and well-wishers
Sponsorship,income,yes,Local businesses supporting events
Event tickets,income,yes,Cultural programme and tournaments
Interest,income,yes,Bank interest credited
Other income,income,yes,Anything not covered above
Ground maintenance,expense,yes,Playing surface and equipment
Event expenses,expense,yes,Cultural programme and tournaments
Utilities,expense,yes,Electricity and water at the premises
Repairs,expense,yes,Building and furniture
Sports equipment,expense,yes,Bats balls nets and kit
Refreshments,expense,yes,Tea and food at meetings and events
Printing and stationery,expense,yes,Notices receipts and registers
Charity and service,expense,yes,Health camps and relief work
Bank charges,expense,yes,Fees debited by the bank
Other expenses,expense,yes,Anything not covered above
`

export const DEMO_TRANSACTIONS_CSV = `date,kind,amount,fund,to_fund,category,source,description,reference
2026-04-02,income,12000,Club UPI,,Membership fees,Annual renewals batch 1,24 members renewed for 2026-27,UPI-APR-001
2026-04-05,income,3500,Cash box,,Donations,Ward 12 collection drive,Door-to-door collection,
2026-04-06,expense,1800,Cash box,,Refreshments,Sharma Tea Stall,Tea for the general body meeting,BILL-0412
2026-04-08,income,25000,Bank account,,Sponsorship,Bose Hardware,Annual sponsorship for the tournament,CHQ-114502
2026-04-10,expense,7500,Bank account,,Ground maintenance,Green Turf Services,Grass cutting and rolling,INV-2291
2026-04-12,transfer,10000,Club UPI,Bank account,,Internal transfer,UPI collections moved to the bank,
2026-04-14,income,4200,Club UPI,,Event tickets,Cultural evening advance sales,42 tickets at 100 each,UPI-APR-018
2026-04-15,expense,2650,Cash box,,Printing and stationery,Nabin Press,Notices and receipt books,BILL-0455
2026-04-18,income,8000,Cash box,,Membership fees,Annual renewals batch 2,16 members renewed,
2026-04-20,expense,15400,Bank account,,Sports equipment,Kolkata Sports House,Two cricket kits and nets,INV-8830
2026-04-22,expense,3100,Bank account,,Utilities,CESC,Electricity for March,ACC-77120
2026-04-25,income,1500,Cash box,,Donations,Anonymous well-wisher,Cash donation at the office,
2026-04-26,expense,9800,Festival fund,,Event expenses,Sound and Light Decorators,Advance for the annual programme,INV-5512
2026-04-28,expense,236,Bank account,,Bank charges,Bank,Quarterly account maintenance,
2026-04-30,income,412,Bank account,,Interest,Bank,Quarterly savings interest,
2026-05-03,income,9500,Club UPI,,Membership fees,Annual renewals batch 3,19 members renewed,UPI-MAY-004
2026-05-06,expense,5200,Cash box,,Charity and service,Ananda Diagnostics,Health camp screening charges,INV-3301
2026-05-09,expense,1250,Cash box,,Repairs,Local carpenter,Repair to the hall benches,
2026-05-12,income,6000,Bank account,,Donations,Retired members group,Collected at the reunion,CHQ-114611
2026-05-15,transfer,5000,Bank account,Festival fund,,Internal transfer,Allocation to the festival fund,
2026-05-18,expense,3400,Festival fund,,Event expenses,Milan Caterers,Deposit for the community lunch,INV-2210
2026-05-22,income,2000,Cash box,,Other income,Scrap sale,Sale of old furniture,
2026-05-25,expense,880,Cash box,,Refreshments,Sharma Tea Stall,Tea at the committee meeting,BILL-0501
2026-05-28,expense,7200,Bank account,,Ground maintenance,Green Turf Services,Boundary rope and marking,INV-2340
2026-05-31,income,398,Bank account,,Interest,Bank,Monthly interest credited,
`

/** The three spreadsheets, in the shape `InMemoryFinanceStore.seed()` expects. */
export const DEMO_CSV = {
  funds: DEMO_FUNDS_CSV,
  categories: DEMO_CATEGORIES_CSV,
  transactions: DEMO_TRANSACTIONS_CSV,
} as const
