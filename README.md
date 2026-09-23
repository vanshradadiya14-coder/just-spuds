# Just Spuds Aylesbury

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # exercises the real store modules (stock, roles, till, checkout, sync, VAT)
node scripts/probe-sync-readonly.mjs   # read-only check that the live Supabase queries are valid
```

## Going live — the short version

Open **`/admin` → 🚀 Go-Live** on the owner's laptop. It checks everything live
and links to each fix:

1. **All devices in sync** — green once the laptop has talked to Supabase.
2. **Change every starter PIN** (Staff PINs and Driver PINs). The starter PINs
   ship with the source code, which is public — until they are changed anyone
   who reads it could sign in. New PINs are 4–8 digits; use 6 for managers.
3. **Business details** — shop phone, address and (only if VAT-registered) the
   VAT number. Receipts, the website footer and "call the shop" links use them.
4. Set **opening hours** (Store Ops) and check **menu prices, VAT rates and
   stock counts** (Product Studio). Cold takeaway food is usually 0% VAT — ask
   the accountant, then set it per product.
5. On each till: ⚙️ → connect the USB printer, test the drawer. Optionally add
   `public/sounds/new-order.mp3` for your own alarm sound.
6. **Send 2 test orders** and practise Accept / Decline on the kitchen screen.
   Test orders are marked TEST and never counted anywhere.
7. **Launch day, before opening the till:** press **Start trading fresh**. Every
   device drops pre-launch orders, shifts, timecards and audit entries (menu,
   stock, staff and settings are kept). Then **switch online ordering on**.

Every staff device needs one sign-in with a staff PIN to become a "staff
device" — after that it receives all orders even while its PIN screen is locked
(the kitchen tablet keeps ringing).

That's it. **No asset step is required** — see below.

## Images just work now

Earlier builds expected you to download the photographs first, and if you
didn't, every image slot showed a grey placeholder. That was a bad design.

`src/data/images.ts` now maps each image to its source on the generator's CDN,
and `SmartImage` loads that by default. Nothing to run, nothing to download.

If you *do* want the files served from your own domain — faster, and not
dependent on someone else's CDN staying up — run:

```bash
npm run assets     # downloads all 17 into public/assets
```

Once a local copy exists it's used automatically. The order is: local file →
CDN → neutral placeholder. Three levels, so an image slot can only look broken
if all three fail.

## Pages

Real routes, not anchors on one long page:

| Route          | What's there                                          |
|----------------|-------------------------------------------------------|
| `/`            | Hero, three signature spuds, build teaser, story teaser |
| `/menu`        | Full menu, sticky category rail, spuds as a picture grid, everything else typeset |
| `/menu/:id`    | Product page — extras, sauces, meal upgrade, quantity, related items |
| `/build`       | Build a spud                                           |
| `/story`       | 1239 charter, Victorian street trade, the offer        |
| `/find-us`     | Address, directions, order-ahead card                  |
| `/track/:id`   | Live order tracking                                    |
| anything else  | 404                                                    |

### Staff portals

Full-screen, no customer chrome. Sign in at `/login` with a PIN; each role
lands on its own portal and the shop-floor gates accept every shop-floor role.

| Route     | Who                                      |
|-----------|------------------------------------------|
| `/pos`    | Till — cashiers and up                   |
| `/staff`  | Kitchen display — kitchen staff and up   |
| `/admin`  | Reports, stock, menu, staff, audit — supervisors and up |
| `/driver` | Courier hub                              |
| `/cfd`    | Customer-facing display for the till     |

Staff and PINs are managed in **Admin › Staff Accounts** (drivers in
**Drivers & Fleet**). PINs are stored only as salted hashes and are never shown.
The starter accounts' PINs are in `src/services/staffRoster.ts`; change them all
before trading (see *Going live*).

Manager-only actions on the till (refunds, no-sale, settings, price override,
voiding a sent item) prompt for a supervisor-or-above PIN. Till settings (auto
receipt, drawer kick, siren, tap sounds, blind cash count, tip prompt, default
float, USB printer) live behind ⚙️ on the till and sync to every open till tab.

**PIN policy.** Staff sign in by PIN only — there is no email/password staff
login, no on-screen PIN hints and no tap-to-sign-in profiles. Five wrong PINs
lock every PIN prompt on that device for 30 s, doubling to a 5-minute cap.
Changing someone's PIN (or disabling them) signs them out on every device. A
browser that has never reached the server refuses the published starter PINs.
The till locks itself after 5 idle minutes (⚙️ to change; optional "lock after
every sale"). "Manual fix" (changing an order's payment or total) is a
manager-only tool.

**Screens.** Everything works from a phone up to a kitchen monitor. Below
1024px the till turns into a tablet layout: categories become a swipeable
strip, the ticket lives in a bottom sheet opened from the sticky total bar,
and the toolbar scrolls sideways instead of clipping. The KDS shows four
columns on a 1366px screen and stacks on a phone; admin tables scroll inside
their cards.

### Till flow (modelled on Square / Toast / Lightspeed quick-service)

- **Ring up** from the category rail, ❤️ Favourites (owner's "popular" flags
  plus the last 30 days' best sellers), speed keys, search, or a barcode scan.
- **Attach a customer** (👤) by phone — visit count and lifetime spend show on
  the ticket and the order is stored under their number.
- **Send** fires the ticket to the KDS as an *open check* to be paid at
  collection; **Cash / Card / Split** take payment now. Open Checks (📋) lists
  everything sent but unpaid: settle it, reprint the ticket, or void it with a
  reason. While settling you can add items; removing an item that already went
  to the kitchen needs a reason and a manager PIN, and the stock goes back.
- **Sale complete** shows change due (or total charged) and asks Print / Email /
  No receipt — skipped when auto-receipt is on. Enter starts the next sale.
- **Tips** on card payments are optional (⚙️) and recorded separately from sales.
- **Time clock** (⏱️): staff clock in, break and out from the PIN gate without
  opening the register; timecards are in Admin › Staff.
- Keyboard: `F2` search, `F4` cash, `F5` card, `F6` split, `F8` send, `F9` hold,
  `/` or `Ctrl+K` search. The header shows an OFFLINE pill when the network
  drops — sales keep working locally and sync when it returns.

### New online order alarm (KDS, till and admin)

When a customer places a web order every staff screen raises it and the alarm
**keeps ringing until someone accepts, declines or silences it** — the way a
Deliveroo tablet or a Subway KDS behaves.

- **KDS** (`/staff`) shows a full-screen alert with the whole ticket: Accept /
  Accept & Print / Decline / Silence. `Enter` accepts the order in front; with
  several waiting, "Accept all" clears the queue. The PIN screen shows a
  "N new orders waiting" banner so a locked tablet still rings.
- **Till** shows the red "Online Orders Pending" button → Accept & Print or
  Silence. **Admin** gets a banner with one-tap Accept and a "N new" badge on
  Live Orders.
- Accepting anywhere (or a cancellation) silences every other screen. A
  silenced order stays in the New column and never re-rings, even after a
  reload. Several tabs on one PC share one sound (Web Locks) so it never doubles.
- **The sound:** drop the store's file at `public/sounds/new-order.mp3` (or
  `.wav` / `.ogg`); a manager can also upload a per-device sound, set the
  volume and test it from KDS 🔔 ⚙️, Till ⚙️ → *New order alert sound*, or
  Admin → *Alert Sound*. With no file the built-in two-tone siren plays. The
  on/off switch is the till's "Online order siren" setting.
- Browsers only allow sound after the first tap on the page; the alert shows
  "Tap anywhere to enable sound" until then.

### Order rules (enforced in the stores, not just the buttons)

- **Web checkout** (`services/checkout.ts`) re-checks everything itself:
  ordering switched on, trading hours and last-orders cutoffs, kitchen pause,
  stock and channel, delivery postcode and minimum basket, and it re-prices the
  basket from the live menu — stale prices, a voucher that no longer applies or
  a smuggled price override are corrected, never trusted.
- **Status changes**: cancelled and completed orders are final; a till/phone
  open check that hasn't been paid cannot be "completed" from the kitchen (the
  card says *take payment on the till* instead), so no sale slips past the shift.
- **Cancel / refund**: an order cancels once (stock comes back once); refunds
  are capped at what's left to refund; cash refunds reduce the drawer's
  expected cash and show on the Z-report; a shift can't close over unpaid checks.
- **Customers** can cancel from the tracking page only until the kitchen
  accepts — after that it's a phone call.
- **Admin › Live Orders**: click any row for the full order (ticket, customer,
  payment, timeline, notes) with one-tap next-step / print / cancel.

### One shop, many devices (`services/cloudSync.ts`)

Every store is local-first — instant, and it keeps working offline — and a sync
engine keeps the devices in step through Supabase, using tables that already
exist (no migration needed):

| What | Where | How |
|------|-------|-----|
| Orders | `orders` | Outbox that survives reloads; retried until the server has them. Newest copy wins. Customer phones only ever hold their own orders. |
| Menu, prices, sold-out flags, hours, online switch, kitchen pause, promos, drivers, staff roster, blacklist hashes | `delivery_settings` (used as a key/value store) | Whole documents, last write wins. Only staff devices publish. |
| Stock counts | `menu_stock` | One row per product, changed by deltas so two tills selling at once both count. |
| Till shifts (Z-reports), timecards, audit log | `delivery_settings` rows | Staff devices only; the owner sees every till's Z-reports and voids from anywhere. |

Staff screens get changes instantly (realtime) and poll every 20 s as a
backstop; customer browsers poll. Every staff header shows a **Synced /
Offline · N waiting** pill — tap it to sync now.

**Security — next step after launch.** The site still talks to Supabase with the
public anon key, and the tables allow the anon role to read and write, so a
technically-minded visitor could read orders or edit data through the API.
Sync hides other people's data from customer browsers and checks prices on
staff screens, but the real fix is server-side: give staff devices a Supabase
Auth login and tighten the Row Level Security policies so the anon role can
only place orders and read the public menu. Worth doing in the first weeks.

### VAT

VAT comes from each product's own rate (Product Studio), not a flat 20%: cold
takeaway food can be 0%, anything eaten in is standard-rated, discounts are
spread across the goods they apply to, delivery/service charges are standard,
and tips are outside VAT. The till, receipts and customer display show VAT only
when a VAT number is set.

### Stock and channels

Every product carries `stockQuantity`, `lowStockThreshold` and
`channelVisibility` (`all` / `in_store_only` / `online_only`). Web, till and
phone orders all deduct from the same count; cancellations put it back. A
product that runs out goes off sale automatically and comes back when
restocked — but a manual 86 by a manager survives both. In-store exclusives
never appear on the public menu (a direct link 404s) and online-only items
never appear on the till grid.

`public/_redirects` and `vercel.json` are included so deep links survive a
static host. Without one of those, refreshing on `/menu` 404s.

## Ordering flow

The thing a takeaway site has to get right is the path from *looking* to
*ordering*, so:

- **A persistent order rail** slides up from the bottom the moment anything is
  added, on every page, showing count and running total. It's the single most
  useful component here.
- **Product pages** carry the whole configuration — extras with prices, free
  sauces, the £1.95 meal upgrade, quantity — and the button shows the real total
  before you commit.
- **Related items** at the bottom of every product page keep the basket growing.
- Every dead end routes somewhere useful: the empty cart links to the menu, 404
  links to the menu, the find-us card starts an order.

## Design

**Fraunces**, a variable serif, with optical sizing at 120 and the SOFT and WONK
axes raised so headings read as drawn rather than set. Inter for UI. Second
lines go italic.

Greyscale only — near-black `#0A0A0B` through paper `#F0EFED`. No chromatic
accent anywhere. The food is the only colour, which is the point.

A fixed film-grain plate sits over everything; it's what stops flat greys
looking like unstyled divs. Photographs wipe open behind a travelling clip-path
while counter-scaling inside, so the subject holds still as the mask moves.

## Photography, not CG

CG food was removed entirely, along with three.js, fiber and drei — browser-
rendered food reads as CG no matter how much effort goes in. Every item on the
menu now has its own photograph instead, shot to one spec: round matte charcoal
ceramic carrying the JUST SPUDS label, single soft key light from upper left,
seamless dark ground, restrained near-monochrome grade.

The only 3D left is abstract: a raymarched signed-distance field in
`src/gl/`, drawn in raw WebGL2 as a background of light and form. It falls back
to the CSS mesh if the context is missing, the shader fails to compile, or the
context is lost.

## Motion

`ProductStage` treats a photograph as an object on a lit stage rather than as
wallpaper — pointer tilt with inertia, an idle float, and (on the hero only)
scroll-linked recession. Transforms are written straight to `style` inside one
rAF loop; routing them through React state would re-render the page every frame.

`NameBand` runs the menu across the screen in giant type. Each name is a real
link, and only the first pass is exposed to assistive tech — the repeats that
make the loop seamless are `aria-hidden` with `tabIndex={-1}`.

Route changes fade and lift via `AnimatePresence` in `Layout`. It reads the
outlet with `useOutlet()` so the outgoing page keeps its own content while it
leaves, and defers the scroll reset to `onExitComplete` so nothing jumps
mid-transition.

Everything above is disabled under `prefers-reduced-motion`.

## Menu data

`src/data/menu.ts`, transcribed from the in-store boards — 7 spuds, 7 baguettes,
3 paninis, 3 salads, 8 hot drinks, 8 cold drinks, 8 snacks, plus toppings,
extras, sauces and the meal upgrade. Counts and from-prices shown on the site
are derived from this file at render time, so the pages cannot drift out of
step with the boards. Handwritten board prices were used over the
printed ones they covered. `UNCONFIRMED` lists the two things the photos
couldn't settle.

## Not connected

- **Payment** — `src/services/checkout.ts` returns an honest "not connected"
  result. Swap a provider in via `setCheckoutProvider()`.
- **Social links, phone, opening hours** — `null` in `src/data/site.ts`.
