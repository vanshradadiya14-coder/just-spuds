# Just Spuds Aylesbury

```bash
npm install
npm run dev        # http://localhost:5174
npm test           # exercises the real store modules (stock, roles, till shift, checkout)
```

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

| Route     | Who                                      | Demo PINs                    |
|-----------|------------------------------------------|------------------------------|
| `/pos`    | Till — cashiers and up                   | `1111` cashier               |
| `/staff`  | Kitchen display — kitchen staff and up   | `1234` kitchen               |
| `/admin`  | Reports, stock, menu, staff, audit       | `3333` supervisor, `5555` manager, `2468` owner, `8888` admin |
| `/driver` | Courier hub                              | `7777`                       |
| `/cfd`    | Customer-facing display for the till     | —                            |

Manager-only actions on the till (refunds, no-sale, settings, price override,
voiding a sent item) prompt for a supervisor-or-above PIN. Till settings (auto
receipt, drawer kick, siren, tap sounds, blind cash count, tip prompt, default
float, USB printer) live behind ⚙️ on the till and sync to every open till tab.

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
