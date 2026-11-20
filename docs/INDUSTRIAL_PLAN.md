# Just Spuds — plan to reach EPOS Now / Foodhub level

Written 2026-11-12 from an audit of commit `c60fd52` (the version live on
www / pos / admin.justspuds.uk). The server sign-in SQL
(`supabase/migrations/20261028_staff_security.sql`) **has been run** on the live
database: PINs are checked by the server and devices must be paired.

State at the audit: `npx tsc --noEmit` clean, `npm test` 79 + 29 passing.

Work top to bottom. Each phase lists what to build and how to know it is done.
Phase 0 is small bug fixes and can ship on its own. Phases 1–3 need decisions
from the owner first (listed at the end).

---

## What the product is missing compared with EPOS Now / Foodhub

| Area | Today | Industrial level |
|------|-------|------------------|
| Orders database | Any visitor with the public key can read and write `orders` and `menu_stock` (names, phones, addresses included) | Orders placed, read and changed only through server functions; row security on every table |
| Prices and rules | Checked in the customer's browser, re-checked on staff screens | Server re-prices and validates every order before it exists |
| Phone "verification" | Format rules only — any well-formed number passes | One-time SMS code proves the customer holds the phone |
| Address "verification" | Postcode exists (when the lookup answers) + street text pattern | Customer picks a real address from a Royal Mail lookup; delivery limited by distance |
| Payments | None online (pay at counter / to driver); checkout waits 450 ms and calls it a gateway check | Card / Apple Pay / Google Pay online, card terminal on the till, refunds through the gateway |
| Who may change what | Any paired device may write any shop document | Server checks the signed-in person's role per change |
| Code structure | `AdminPage.tsx` 3,574 lines, `orderStore.ts` 3,081, `StaffPOSPage.tsx` 2,870 | Feature folders, files under ~500 lines |
| Release process | Manual `npx vercel --prod`; browser walkthroughs live outside the repo | CI on every push (types, tests, build, browser tests), preview deploys |
| Monitoring | None | Error reporting, uptime check, database backups tested |

---

## Phase 0 — bugs found in the audit (fix first)

Each was reproduced on the current code.

### Customer verification (`services/customerVerification.ts`, `data/deliveryZones.ts`, `services/blacklistStore.ts`)

1. **Blocked numbers can still order.** `isPhoneBlacklisted` runs on the raw
   text before `validateUKPhone` normalises it, and `normalizePhone` does not
   handle a bare `44…` prefix. `447911654987` passes the blacklist for a blocked
   `07911 654987`. Fix: one shared normaliser; check the blacklist on the
   normalised number.
2. **Real phone numbers are refused.** `07911 123456`, `07812 345678` and
   `07400 121212` are rejected as "sequential" / "repeating" — these are
   ordinary allocatable numbers. `0330 …` (03 numbers) are refused outright.
   Keep only the all-same-digit rule; accept 03.
3. **Real names are refused, fake ones accepted.** Names in non-Latin scripts
   (`王伟`, `محمد علي`) fail "at least 2 letters"; vowel-less transliterations
   fail. `Test User` and `Mickey Mouse` pass. Use `\p{L}` for letters and drop
   the consonant rule — it cannot tell a real name from a fake one.
4. **Street check accepts non-addresses.** `Flat 3`, `Unit 5`, `14 the`,
   `Rose Cottage` (no street) pass. `Flat 2, 10000 Tring Rd` is refused by the
   repeated-character rule. Text rules cannot verify an address — see Phase 2.
5. **A postcode that does not exist can still be ordered to.** The Postcodes.io
   check is only in the UI (`CheckoutModal`, `CartDrawer`); `validateCheckout`
   only checks the format. `HP20 9ZZ` passes the service.
6. **Delivery area is by postcode district, not distance.** HP17, HP18 and HP22
   reach villages 15–20 km away (Brill, Long Crendon, Wendover). The lookup
   already returns latitude / longitude — store them and limit by road-ish
   distance from the shop.
7. **Zone prices are shown but not charged.** `DELIVERY_ZONES` defines per-zone
   fee, minimum and free-delivery threshold; checkout charges the single
   `deliverySettings` fee and minimum. Staff-entered delivery orders
   (`createManualCounterOrder`) hard-code £3.99 + 99p, different again from the
   website's settings fee + 49p. One fee function for every channel.
8. **Reverse geocoding goes to OpenStreetMap Nominatim from customer browsers**
   with no attribution and no identification, against its usage policy, and
   sends the customer's location to a third party not named in the privacy
   page. Remove it when Phase 2's address lookup lands (or proxy and cache it).
9. London numbers are formatted `02079 460958`; cosmetic.

### Admin and till

10. **"Complete fresh start" (`services/resetService.ts`) does not reset
    reliably.** It ignores a failed `startFresh` (which returns `{ok:false}`,
    it does not throw) and wipes this device anyway — the server copy then
    syncs straight back. It posts `DATA_RESET` on channels nothing listens to
    (`just_spuds_orders_bus`, `just_spuds_till_shift_bus`,
    `just_spuds_cart_bus`), and the open shift held in memory by `tillStore`
    is written back on the next sale. It also clears a key that does not exist
    (`just_spuds_cfd_ticket_state_v1`). Fix: stop on a failed epoch, reload the
    stores (or the page) after wiping, and add a test.
11. **Driver sign-in was removed from the in-browser path** (commit `3e8587d`)
    but `/driver` and its PIN form remain. With server sign-in live, drivers
    still sign in through the server; decide whether drivers are kept (see
    decisions) and remove whichever half is dead.
12. `StaffAccounts.tsx:516` still calls the old synchronous `loginWithPin`
    (old sign-in path only).
13. The standby screen (`PosOperatorStandby`) tells the person when a PIN is
    valid but belongs to someone else. Say "wrong PIN" instead.
14. `checkout.ts` waits 450 ms and comments it as a payment gateway check.
    No payment is taken. Remove the delay and the wording.

**Done when:** each item has a test in `scripts/test-epos.mjs` that failed
before the fix, `npm test` passes, and the browser walkthroughs still pass.

---

## Phase 1 — the server owns orders and stock (BUILT 2026-11-20, waiting for the owner to run the SQL)

Built as `supabase/migrations/20261120_orders_server.sql` with 46 tests in
`scripts/test-staff-security.mjs` (the SQL as the public key in PGlite, then
the app as a paired till and as a customer's browser). See *Orders and stock
on the server* in the README for what it does and how to switch it on.

Left out on purpose, to follow: opening hours checked in SQL; prices of extras
for wraps / rice boxes / paninis (publish those lists as a shared document
first); per-person role checks in `jsp_sync_put`; live updates use a public
`order_events` ping table instead of a broadcast channel.

The original brief, for reference:

The largest gap. Follow the pattern already used for sign-in
(`20261028_staff_security.sql`): private schema, `SECURITY DEFINER` functions,
row security, tests in PGlite (`scripts/test-staff-security.mjs`).

- `jsp_place_order(payload)` — callable by anyone. Re-prices from the menu
  documents, checks hours, stock, channel, minimums, delivery area, voucher and
  blacklist **in SQL**, takes stock atomically, rate-limits by address, and
  returns the order id plus an unguessable tracking token.
- `jsp_track_order(id, token)` — the only way a customer reads an order;
  returns their own order without other customers' data. Customer cancel and
  review go through functions that take the same token.
- `jsp_orders_list / jsp_order_update / jsp_stock_set` — paired device token
  and a signed-in session; the server enforces the status rules
  (`getStatusChangeBlocker`) and refund caps.
- Row security: no direct access to `orders` or `menu_stock` for the public
  key. Live updates for staff via a Supabase Realtime **broadcast** channel fed
  by a trigger (table change events no longer reach the public key), with the
  20 s poll as the backstop.
- Per-person permissions: `jsp_sync_put` takes the session as well as the
  device, and menu, prices, settings, till list and blacklist changes need a
  manager session. Records (shifts, timecards, audit) need any staff session.
- Menu and settings stay as documents; the server reads them to price orders.

**Done when:** with only the public key, every direct read or write of
`orders`, `menu_stock` and `delivery_settings` private rows fails; an order with
edited prices is rejected by the server; two tills selling the last item cannot
both succeed; PGlite tests cover each function; the multi-device browser test
passes against the migrated database.

Roll-out order matters, as before: deploy the app that can use both paths, then
run the SQL.

---

## Phase 2 — phone and address checks, free tools only (DONE 2026-11-12)

The owner chose free options, so there is no SMS code and no paid address
lookup. What that leaves:

- **Phone:** format check only (UK mobile or 01/02/03 landline). Nothing free
  can prove a customer holds a number; the driver or the shop phones before
  setting off if anything looks off. Revisit SMS codes only if fake orders
  become a problem (about 4p each).
- **Address:** the postcode must exist (Postcodes.io, free, Royal Mail data)
  and the street line must carry a door number and a street name. There is no
  free list of real addresses, so the street stays typed.
- **Delivery area: a radius from the shop**, not postcode districts. The
  postcode lookup gives coordinates; the order is refused when the straight-line
  distance from Market Square is over the radius set in *Admin › Store &
  Delivery Ops* (default 5 km — the town). HP17–HP22 stays as a cheap first
  filter. The coordinates are stored on the order for the driver app. A radius
  change applies at once, without a new lookup.
- When Phase 1 lands, these checks run again in SQL (the browser's copy is for
  instant feedback only).

**Done:** a well-formed postcode that does not exist, or one 11 km out, is
refused at checkout; 2 km in is accepted and the order carries its
coordinates; the radius is editable in Admin. Tests in `scripts/test-epos.mjs`
("Phase 0" section).

---

## Phase 3 — payments (NOT WANTED)

The owner takes payment at the counter and by the driver's card machine. No
online payment, no terminal integration. The code paths stay as they are:
web orders are `pending_store` / `pending_delivery` until paid on the till or
by the driver.

---

## Phase 4 — engineering standards

- Split the three large files by feature (`admin/reports`, `admin/menu`,
  `admin/delivery`, `pos/ticket`, `pos/shift`, `orders/…`) with no behaviour
  change; one pull request per area, tests green each time.
- Move the browser walkthroughs from the scratchpad into the repo
  (`e2e/`, Playwright, run against the PGlite stand-in server).
- GitHub Actions: type check, both test suites, build, e2e on every push.
  Connect Vercel to the repository for preview deployments; production from
  `main` after checks pass.
- Error reporting (Sentry), an error boundary on every portal, uptime check,
  and a tested database backup and restore.
- Numbered migrations in `supabase/migrations/`, each with PGlite tests.
- Data protection: retention period for orders and customer details, export
  and delete on request, privacy page listing every third party.

---

## Phase 5 — features the big systems have

In rough order of value for a takeaway:

1. **Menu model:** modifier groups with min / max choices, combos and meal
   deals as data, sizes, timed menus and prices (lunch deal), per-channel
   availability by time.
2. **Stock by ingredient:** recipes, automatic depletion, wastage, supplier
   orders, low-stock alerts, stock-take.
3. **Kitchen:** printer routing by station (ESC/POS through a small local print
   agent), order throttling, prep-time learning, allergen prompts on tickets.
4. **Delivery:** dispatch board, real driver location, proof of delivery,
   driver cash reconciliation.
5. **Customers:** accounts, order history and reorder, server-side loyalty,
   marketing by SMS / email with recorded consent.
6. **Staff:** rota, permissions per role editable in Admin, timesheets export.
7. **Back office:** accounting export (Xero / CSV), VAT return figures,
   multi-day and year-on-year reports, scheduled email of the daily report.
8. **Channels:** Deliveroo / Uber Eats / Just Eat orders into the same kitchen
   screen through an aggregator hub (Deliverect or similar).
9. **Multi-store** (`store_id` is already on the tables).

---

## Decisions from the owner (2026-11-12)

1. **Payments:** pay at the counter and pay the driver. No online payments —
   Phase 3 is dropped.
2. **Phone and address:** free options only — no SMS codes, no paid address
   lookup. Phase 2 is done with Postcodes.io and a distance check.
3. **Delivery:** yes, with drivers, **within Aylesbury** — a 5 km radius from
   Market Square by default, editable in Admin.
4. **One shop.** Multi-store (5.9) is not needed.

Next up is **Phase 1** (the server owns orders and stock). It needs the owner
to run one SQL file in Supabase after the matching app is deployed, as before.

---

## Prompt for the model that executes this

> You are continuing work on the Just Spuds repository (React 18, Vite, TypeScript strict, Supabase). Read `docs/INDUSTRIAL_PLAN.md`, `README.md` and the memory notes first.
>
> Do **Phase 0** now, one numbered item at a time. For each item: write a test in `scripts/test-epos.mjs` that fails on the current code, make the smallest fix, and run `npx tsc --noEmit` and `npm test`. Do not start Phase 1–3 until the owner has answered the decisions in the plan; ask them with the options listed there.
>
> Rules of this project:
> - Never write test data to the live Supabase project. Tests use the placeholder environment, the in-memory backend, or PGlite. In browser tests block `supabase.co`, Firebase and Google.
> - Server changes are SQL files in `supabase/migrations/`, tested in PGlite as the `anon` role, safe to run twice. The owner runs them in the Supabase SQL editor; deploy the app that supports both the old and new path before the SQL is run.
> - The repository is public: no PINs, keys or customer data in code, tests or docs.
> - Commit to `main` with a message that says what changed for the shop. Pushing does not deploy; only deploy when the owner asks, with `npx vercel --prod --yes`, after deleting any `dist-*` test builds, and confirm all five domains serve the new bundle.
> - Use PowerShell for node and npm. Do not rebuild a bundle while a preview server is serving it.
> - Match the existing code style and comment density. Keep user-facing wording plain and honest: no claim the software cannot back up (no "verified" for a format check, no "payment approved" without a payment).
> - After each phase: update `README.md`, run the till walkthroughs and the all-pages sweep at phone, tablet and desktop sizes, and report what was checked and what was not.
