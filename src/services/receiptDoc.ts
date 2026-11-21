/**
 * RECEIPT LAYOUT — one description of every slip the till prints.
 *
 * A receipt is a list of simple blocks (title, centred line, label/amount row,
 * rule…). The same blocks are turned into:
 *   - ESC/POS bytes for a receipt printer connected directly (USB / serial), and
 *   - HTML for the on-screen preview and the Windows-printer route,
 * so what the cashier sees is what comes out of the printer.
 *
 * Layout follows the big EPOS systems: shop → order type & number → date, till,
 * server → items with their options → totals → how it was paid (and change) →
 * VAT → customer details (web / phone only) → thank you.
 *
 * Pure: no stores are read here; callers pass the shop details in.
 */
import { MEAL_DEAL } from '../data/menu'
import { lineUnitPrice, type CartLine } from '../hooks/useCart'
import type { Order } from './orderStore'
import type { EndOfDayReport, ReportRow } from './endOfDayReport'
import { lineExtras, mealDrinkName, mealSnackName, modifierText, saladsText, saucesText } from '../utils/lineText'
import { parseKitchenNotes } from '../utils/kitchenNotes'

export type ReceiptBlock =
  /** Shop name: double width & height, centred. */
  | { t: 'title'; text: string }
  /** Double height, bold, centred — order number, TOTAL banner. */
  | { t: 'big'; text: string }
  | { t: 'center'; text: string; bold?: boolean }
  | { t: 'text'; text: string; bold?: boolean; indent?: number }
  /** Label on the left, amount on the right. */
  | { t: 'row'; left: string; right: string; bold?: boolean; indent?: number; big?: boolean }
  /** White on black, centred: allergy alerts, "NOT PAID". */
  | { t: 'inverse'; text: string }
  | { t: 'rule'; heavy?: boolean }
  | { t: 'gap' }

export interface ReceiptBusiness {
  name: string
  addressLines: string[]
  phone: string
  vatNumber?: string
}

export interface CustomerReceiptOptions {
  business: ReceiptBusiness
  /** VAT bands to print (only when VAT registered). */
  vatBands?: { rate: number; gross: number; vat: number }[]
  /** 'bill' = the unpaid ticket handed to a table before paying. */
  kind?: 'receipt' | 'bill'
  /** Cash handed over, for the "Cash / Change" lines. */
  cashTendered?: number
  changeDue?: number
  footer?: string
}

/** 1234 → "12.34"; −50 → "-0.50". */
export const money = (pence: number) => `${pence < 0 ? '-' : ''}${(Math.abs(pence) / 100).toFixed(2)}`
const pounds = (pence: number) => `${pence < 0 ? '-' : ''}£${(Math.abs(pence) / 100).toFixed(2)}`

const dateOf = (iso: string) => new Date(iso).toLocaleDateString('en-GB')
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** "[TILL: Till 1] TAKEAWAY • Cashier: Sam" → { till: 'Till 1', cashier: 'Sam', type: 'TAKEAWAY' } */
function tillMeta(notes?: string) {
  const till = notes?.match(/\[TILL:\s*([^\]]+)\]/i)?.[1]?.trim()
  const cashier = notes?.match(/Cashier:\s*([^•\]]+)/i)?.[1]?.trim()
  const type = notes?.match(/\]\s*(TAKEAWAY|EAT[_ ]IN|PHONE)/i)?.[1]?.toUpperCase().replace('_', ' ')
  return { till, cashier, type }
}

/** What the customer is getting: TAKEAWAY, EAT IN, COLLECTION, DELIVERY, PHONE ORDER. */
export function orderTypeLabel(order: Pick<Order, 'fulfilment' | 'source' | 'kitchenNotes' | 'customer'>): string {
  if (order.fulfilment === 'delivery') return 'DELIVERY'
  if (order.source === 'WEBSITE') return 'COLLECTION'
  const { type } = tillMeta(order.kitchenNotes)
  if (order.customer?.tableNumber || type === 'EAT IN') return 'EAT IN'
  if (order.source === 'PHONE' || type === 'PHONE') return 'PHONE ORDER'
  return 'TAKEAWAY'
}

const tenderName = (method: string) =>
  method === 'cash' ? 'Cash' : method === 'card' ? 'Card' : method === 'online' ? 'Payment link' : method === 'complimentary' ? 'No charge' : 'Paid'

/** The pieces of a line: the item at its own price, then each paid option. */
function lineBlocks(line: CartLine, withPrices: boolean): ReceiptBlock[] {
  const q = Math.max(1, line.qty || 1)
  const out: ReceiptBlock[] = []
  if (typeof line.priceOverridePence === 'number') {
    out.push({ t: 'row', left: `${q} x ${line.name}`, right: withPrices ? money(line.priceOverridePence * q) : '', bold: true })
    if (line.priceOverrideReason) out.push({ t: 'text', text: `Price set: ${line.priceOverrideReason}`, indent: 4 })
  } else {
    const extras = lineExtras(line)
    const extrasCost = extras.reduce((n, x) => n + x.unit * x.count, 0)
    const modCost = (line.conversationalModifiers || []).reduce((n, m) => n + (m.pricePence || (m.type === 'extra' ? 100 : 0)), 0)
    const meal = line.meal ? MEAL_DEAL.price : 0
    // Whatever is left after the options is the item itself, so the column always adds up.
    const own = lineUnitPrice(line) - extrasCost - modCost - meal
    out.push({ t: 'row', left: `${q} x ${line.name}`, right: withPrices ? money(own * q) : '', bold: true })
    for (const m of line.conversationalModifiers || []) {
      const cost = m.pricePence || (m.type === 'extra' ? 100 : 0)
      out.push({ t: 'row', left: `${m.type === 'no' ? '-' : '+'} ${modifierText(m)}`, right: withPrices && cost ? money(cost * q) : '', indent: 2 })
    }
    for (const x of extras) {
      out.push({ t: 'row', left: `+ ${x.count > 1 ? `${x.count}x ` : ''}${x.label}`, right: withPrices && x.unit ? money(x.unit * x.count * q) : '', indent: 2 })
    }
    if (line.meal) {
      out.push({ t: 'row', left: '+ Meal deal', right: withPrices ? money(meal * q) : '', indent: 2 })
      const parts = [mealDrinkName(line.mealDrink), mealSnackName(line.mealSnack)].filter(Boolean)
      if (parts.length) out.push({ t: 'text', text: parts.join(' + '), indent: 4 })
    }
  }
  if (line.salads?.length) out.push({ t: 'text', text: `Salad: ${saladsText(line)}`, indent: 2 })
  if (line.sauces?.length) out.push({ t: 'text', text: `Sauce: ${saucesText(line)}`, indent: 2 })
  if (line.notes) out.push({ t: 'text', text: `NOTE: ${line.notes}`, indent: 2, bold: true })
  return out
}

/** "Shop B", "Brook House", "Market Square", "Aylesbury HP20 1SN" → two lines instead of four. */
function packAddress(parts: string[], width = 30): string[] {
  const lines: string[] = []
  for (const part of parts) {
    const last = lines[lines.length - 1]
    if (last && last.length + 2 + part.length <= width) lines[lines.length - 1] = `${last}, ${part}`
    else lines.push(part)
  }
  return lines
}

function headerBlocks(b: ReceiptBusiness): ReceiptBlock[] {
  const out: ReceiptBlock[] = [{ t: 'title', text: b.name.toUpperCase() }]
  packAddress(b.addressLines).forEach((l) => out.push({ t: 'center', text: l }))
  out.push({ t: 'center', text: `Tel ${b.phone}` })
  if (b.vatNumber) out.push({ t: 'center', text: `VAT No ${b.vatNumber}` })
  return out
}

function calloutBlocks(order: Order): ReceiptBlock[] {
  const out: ReceiptBlock[] = []
  if (order.customer?.buzzerNumber) out.push({ t: 'inverse', text: `BUZZER ${order.customer.buzzerNumber}` })
  if (order.customer?.tableNumber) out.push({ t: 'inverse', text: `TABLE ${order.customer.tableNumber}` })
  if (order.isScheduled) out.push({ t: 'inverse', text: `PRE-ORDER FOR ${order.scheduledFor || order.estimatedDeliveryTime}` })
  return out
}

/** The customer's receipt (or the unpaid bill). */
export function customerReceiptDoc(order: Order, opts: CustomerReceiptOptions): ReceiptBlock[] {
  const p = order.payment
  const isBill = opts.kind === 'bill'
  const paid = p.status === 'paid'
  const meta = tillMeta(order.kitchenNotes)
  const server = (p.takenBy || meta.cashier || '').split(' ')[0]
  const isDelivery = order.fulfilment === 'delivery'
  const fromCustomer = order.source === 'WEBSITE' || order.source === 'PHONE' || isDelivery

  const out: ReceiptBlock[] = [...headerBlocks(opts.business), { t: 'rule' }]

  out.push({ t: 'big', text: `${orderTypeLabel(order)}  #${order.shortId}` })
  if (isBill) out.push({ t: 'inverse', text: 'BILL - NOT YET PAID' })
  out.push(...calloutBlocks(order))
  out.push({ t: 'row', left: `Date ${dateOf(order.createdAt)}`, right: `Time ${timeOf(order.createdAt)}` })
  if (meta.till || server) out.push({ t: 'row', left: meta.till ? `Till: ${meta.till}` : '', right: server ? `Served by ${server}` : '' })
  out.push({ t: 'rule' })

  // ---- items
  for (const line of order.lines) out.push(...lineBlocks(line, true))
  const itemCount = order.lines.reduce((n, l) => n + Math.max(0, l.qty || 0), 0)
  out.push({ t: 'rule' })

  // ---- totals
  out.push({ t: 'row', left: `Subtotal (${itemCount} item${itemCount === 1 ? '' : 's'})`, right: money(p.subtotal) })
  if (p.discount > 0) out.push({ t: 'row', left: `Discount${p.promoCode ? ` ${p.promoCode}` : ''}`, right: money(-p.discount) })
  if (isDelivery) out.push({ t: 'row', left: 'Delivery', right: p.deliveryFee === 0 ? 'FREE' : money(p.deliveryFee) })
  if (p.serviceFee > 0) out.push({ t: 'row', left: 'Packaging & service', right: money(p.serviceFee) })
  if (p.tip > 0) out.push({ t: 'row', left: isDelivery ? 'Driver tip' : 'Tip', right: money(p.tip) })
  out.push({ t: 'rule', heavy: true })
  out.push({ t: 'row', left: isBill || !paid ? 'TO PAY' : 'TOTAL', right: pounds(p.total), bold: true, big: true })
  out.push({ t: 'rule', heavy: true })

  // ---- payment
  if (!isBill) {
    if (paid) {
      if (p.splitDetails && p.splitDetails.length > 0) {
        p.splitDetails.forEach((s) => out.push({ t: 'row', left: tenderName(s.method), right: money(s.amount) }))
      } else if (p.method === 'cash' && typeof opts.cashTendered === 'number' && opts.cashTendered > 0) {
        out.push({ t: 'row', left: 'Cash', right: money(opts.cashTendered) })
      } else {
        out.push({ t: 'row', left: tenderName(p.method), right: money(p.total) })
      }
      if (typeof opts.changeDue === 'number' && opts.changeDue > 0) out.push({ t: 'row', left: 'Change', right: money(opts.changeDue), bold: true })
      if (p.cardLast4) out.push({ t: 'text', text: `Card ending ${p.cardLast4}` })
    } else if (p.status !== 'refunded') {
      out.push({ t: 'inverse', text: isDelivery ? 'PAY THE DRIVER - CARD OR CASH' : 'PAY AT THE COUNTER' })
    }
    if (p.status === 'refunded') out.push({ t: 'inverse', text: 'REFUNDED' })
  }

  // ---- VAT
  if (opts.business.vatNumber && opts.vatBands && opts.vatBands.length > 0) {
    out.push({ t: 'gap' })
    out.push({ t: 'row', left: 'VAT rate', right: 'Net     VAT    Gross' })
    opts.vatBands.forEach((b) =>
      out.push({ t: 'row', left: `${b.rate}%`, right: `${money(b.gross - b.vat).padStart(6)} ${money(b.vat).padStart(6)} ${money(b.gross).padStart(7)}` }),
    )
  }

  // ---- customer (web / phone / delivery only — a walk-in has nothing to show)
  if (fromCustomer) {
    out.push({ t: 'rule' })
    if (order.customer.name) out.push({ t: 'text', text: order.customer.name, bold: true })
    if (order.customer.phone) out.push({ t: 'text', text: order.customer.phone })
    if (isDelivery) {
      if (order.customer.streetAddress) out.push({ t: 'text', text: order.customer.streetAddress })
      if (order.customer.postcode) out.push({ t: 'text', text: order.customer.postcode, bold: true })
      if (order.customer.instructions) out.push({ t: 'text', text: `Driver: ${order.customer.instructions}` })
    }
  }
  const note = parseKitchenNotes(order.kitchenNotes).note
  if (note) {
    out.push({ t: 'rule' })
    out.push({ t: 'text', text: `NOTE: ${note}`, bold: true })
  }

  out.push({ t: 'rule' })
  out.push({ t: 'center', text: isBill ? 'Please pay at the counter' : 'Thank you - see you again soon!', bold: true })
  out.push({ t: 'center', text: opts.footer || 'Order online at www.justspuds.uk' })
  return out
}

/** Kitchen ticket: no prices, big order number, everything the cooks need. */
export function kitchenTicketDoc(order: Order): ReceiptBlock[] {
  const out: ReceiptBlock[] = [
    { t: 'big', text: `${orderTypeLabel(order)}  #${order.shortId}` },
    ...calloutBlocks(order),
    { t: 'row', left: `Placed ${timeOf(order.createdAt)}`, right: order.estimatedDeliveryTime ? `Due ${order.isScheduled ? order.scheduledFor || order.estimatedDeliveryTime : order.estimatedDeliveryTime}` : '' },
    { t: 'rule', heavy: true },
  ]
  const note = parseKitchenNotes(order.kitchenNotes).note
  if (note) out.push({ t: 'inverse', text: `ALLERGY / NOTE: ${note}` })
  for (const line of order.lines) {
    out.push(...lineBlocks(line, false))
    out.push({ t: 'gap' })
  }
  out.push({ t: 'rule', heavy: true })
  if (order.customer.name) out.push({ t: 'text', text: order.customer.name, bold: true })
  if (order.fulfilment === 'delivery') {
    if (order.customer.streetAddress) out.push({ t: 'text', text: order.customer.streetAddress })
    if (order.customer.postcode) out.push({ t: 'text', text: order.customer.postcode, bold: true })
  }
  out.push({
    t: 'center',
    text: order.payment.status === 'paid' ? 'PAID' : order.fulfilment === 'delivery' ? 'NOT PAID - driver collects' : 'NOT PAID - take payment at counter',
    bold: true,
  })
  return out
}

/** Short paper version of the end-of-day / X report. */
export function endOfDayDoc(r: EndOfDayReport, business: ReceiptBusiness): ReceiptBlock[] {
  const dt = (iso?: string) => (iso ? `${dateOf(iso)} ${timeOf(iso)}` : '-')
  const isZ = r.kind === 'Z'
  const d = r.drawer
  const out: ReceiptBlock[] = [
    { t: 'title', text: business.name.toUpperCase() },
    { t: 'big', text: isZ ? 'END OF DAY (Z)' : 'X READ' },
  ]
  if (!isZ) out.push({ t: 'center', text: 'Mid-day reading - till still open' })
  out.push(
    { t: 'row', left: 'Till', right: r.tillName },
    { t: 'row', left: 'Shift', right: `#${r.shiftNumber}` },
    { t: 'row', left: 'Opened', right: `${dt(r.openedAt)} ${r.openedBy}` },
  )
  if (isZ) out.push({ t: 'row', left: 'Closed', right: `${dt(r.closedAt)} ${r.closedBy || ''}` })
  out.push({ t: 'row', left: 'Printed', right: dt(r.generatedAt) })
  if (r.note) out.push({ t: 'text', text: `Note: ${r.note}` })

  out.push({ t: 'rule' }, { t: 'text', text: 'CASH DRAWER', bold: true })
  out.push({ t: 'row', left: 'Opening float', right: money(d.float) })
  if (d.floatAdjust !== 0) out.push({ t: 'row', left: 'Float in / out', right: money(d.floatAdjust) })
  out.push({ t: 'row', left: 'Cash sales', right: money(d.cashSales) })
  if (d.cashRefunds > 0) out.push({ t: 'row', left: 'Cash refunds', right: money(-d.cashRefunds) })
  if (d.petty > 0) out.push({ t: 'row', left: 'Petty cash', right: money(-d.petty) })
  if (d.tipOuts > 0) out.push({ t: 'row', left: 'Tip outs', right: money(-d.tipOuts) })
  out.push({ t: 'row', left: 'Expected in drawer', right: money(d.expected), bold: true })
  out.push({ t: 'row', left: 'Counted', right: typeof d.counted === 'number' ? money(d.counted) : 'not counted', bold: true })
  if (typeof d.variance === 'number') {
    out.push({ t: 'inverse', text: Math.abs(d.variance) < 1 ? 'DRAWER BALANCED' : d.variance > 0 ? `CASH OVER ${money(d.variance)}` : `CASH SHORT ${money(-d.variance)}` })
  }
  if (d.noSales > 0) out.push({ t: 'row', left: 'No-sale drawer opens', right: String(d.noSales) })

  out.push({ t: 'rule' }, { t: 'text', text: 'TAKINGS', bold: true })
  r.tenders.forEach((t) =>
    out.push({ t: 'row', left: t.label, right: typeof t.counted === 'number' ? `${money(t.taken)} (counted ${money(t.counted)})` : money(t.taken) }),
  )
  out.push({ t: 'row', left: 'Till total', right: pounds(r.takings.taken), bold: true })
  if (r.deliveries && (r.deliveries.orders > 0 || r.deliveries.stillOut > 0)) {
    out.push({ t: 'row', left: `Deliveries paid to driver (${r.deliveries.orders})`, right: money(r.deliveries.total) })
    out.push({ t: 'row', left: 'of which cash with drivers', right: money(r.deliveries.cash), indent: 2 })
    out.push({ t: 'row', left: "of which card on driver's machine", right: money(r.deliveries.card), indent: 2 })
    if (r.deliveries.stillOut > 0) out.push({ t: 'row', left: `Still out / unpaid (${r.deliveries.stillOut})`, right: money(r.deliveries.stillOutTotal) })
    out.push({ t: 'row', left: 'Till + deliveries', right: pounds(r.takings.taken + r.deliveries.total), bold: true })
  }

  out.push({ t: 'rule' }, { t: 'text', text: 'SALES', bold: true })
  out.push({ t: 'row', left: 'Transactions', right: String(r.sales.transactions) })
  out.push({ t: 'row', left: 'Items sold', right: String(r.sales.items) })
  out.push({ t: 'row', left: 'Gross sales', right: money(r.sales.gross) })
  if (r.sales.discount > 0) out.push({ t: 'row', left: 'Discounts', right: money(-r.sales.discount) })
  out.push({ t: 'row', left: 'Sales total', right: money(r.sales.total), bold: true })
  if (r.vatRegistered) out.push({ t: 'row', left: 'of which VAT', right: money(r.sales.tax) })
  out.push({ t: 'row', left: 'Average sale', right: money(r.sales.average) })
  if (r.sales.tips > 0) out.push({ t: 'row', left: 'Tips', right: money(r.sales.tips) })
  if (r.sales.refunds > 0) out.push({ t: 'row', left: 'Refunds', right: money(-r.sales.refunds) })

  const rows = (title: string, list: ReportRow[]) => {
    if (list.length === 0) return
    out.push({ t: 'rule' }, { t: 'text', text: title, bold: true })
    list.forEach((x) => out.push({ t: 'row', left: `${x.qty} x ${x.label}`, right: money(x.total) }))
  }
  rows('BY CATEGORY', r.byCategory)
  rows('BY PRODUCT', r.byProduct)

  if (r.byEmployee.length > 0) {
    out.push({ t: 'rule' }, { t: 'text', text: 'BY STAFF', bold: true })
    r.byEmployee.forEach((e) => out.push({ t: 'row', left: `${e.label} (${e.transactions})`, right: money(e.total) }))
  }
  if (r.refunds.length > 0) {
    out.push({ t: 'rule' }, { t: 'text', text: 'REFUNDS', bold: true })
    r.refunds.forEach((f) => out.push({ t: 'row', left: `${timeOf(f.at)} #${f.orderShortId || '-'} ${f.method}`, right: money(-f.amount) }))
  }
  if (r.voids.length > 0) {
    out.push({ t: 'rule' }, { t: 'text', text: 'VOIDS', bold: true })
    r.voids.forEach((v) => out.push({ t: 'row', left: `${timeOf(v.at)} ${v.item} (${v.staff})`, right: money(v.value) }))
  }
  if (r.vatRegistered && r.tax.length > 0) {
    out.push({ t: 'rule' }, { t: 'text', text: 'VAT', bold: true })
    r.tax.forEach((t) => out.push({ t: 'row', left: t.label, right: `net ${money(t.net)}  vat ${money(t.tax)}` }))
  }
  if (r.byHour.length > 0) {
    out.push({ t: 'rule' }, { t: 'text', text: 'BY HOUR', bold: true })
    r.byHour.forEach((h) => out.push({ t: 'row', left: `${String(h.hour).padStart(2, '0')}:00 (${h.transactions})`, right: money(h.total) }))
  }
  if (isZ) {
    out.push({ t: 'gap' }, { t: 'text', text: 'Counted by: ____________________' }, { t: 'gap' }, { t: 'text', text: 'Manager:    ____________________' })
  }
  out.push({ t: 'rule' }, { t: 'center', text: `*** END OF ${isZ ? 'DAY REPORT' : 'X READ'} ***`, bold: true })
  return out
}

/* ------------------------------------------------------------- ESC / POS -- */

const ESC = 0x1b
const GS = 0x1d

/** Printer characters: plain ASCII plus £ (code page 437, 0x9C). Emoji and the rest are dropped. */
function encodeText(s: string): number[] {
  const out: number[] = []
  const clean = s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[×]/g, 'x')
    .replace(/[•·]/g, '*')
    .replace(/…/g, '...')
  for (const ch of clean) {
    if (ch === '£') out.push(0x9c)
    else {
      const c = ch.codePointAt(0) || 0
      if (c >= 0x20 && c < 0x7f) out.push(c)
      else if (ch === '\n') out.push(0x0a)
      else if (/\p{L}/u.test(ch)) {
        // é → e and similar; anything else is left out rather than printing junk.
        const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
        if (base && base.charCodeAt(0) < 0x7f) out.push(base.charCodeAt(0))
      }
    }
  }
  return out
}

/** Word-wrap to `width` columns; very long words are broken. */
export function wrapText(text: string, width: number): string[] {
  const w = Math.max(4, width)
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let cur = ''
  for (let word of words) {
    while (word.length > w) {
      if (cur) {
        lines.push(cur)
        cur = ''
      }
      lines.push(word.slice(0, w))
      word = word.slice(w)
    }
    if (!cur) cur = word
    else if (cur.length + 1 + word.length <= w) cur += ` ${word}`
    else {
      lines.push(cur)
      cur = word
    }
  }
  if (cur || lines.length === 0) lines.push(cur)
  return lines
}

/** A label/amount row as fixed-width text lines (the amount on the last line). */
export function rowText(left: string, right: string, cols: number, indent = 0): string[] {
  const pad = ' '.repeat(indent)
  const room = cols - indent
  if (!right) return wrapText(left, room).map((l) => pad + l)
  if (right.length >= room - 2) return [...wrapText(left, room).map((l) => pad + l), right.padStart(cols)]
  const parts = wrapText(left, room - right.length - 1)
  return parts.map((p, i) => (i === parts.length - 1 ? pad + p.padEnd(room - right.length) + right : pad + p))
}

/** Plain-text rendering (tests, email). */
export function receiptText(blocks: ReceiptBlock[], cols: number): string {
  const lines: string[] = []
  const centre = (s: string, w = cols) => wrapText(s, w).map((l) => ' '.repeat(Math.max(0, Math.floor((w - l.length) / 2))) + l)
  for (const b of blocks) {
    switch (b.t) {
      case 'title':
        lines.push(...centre(b.text))
        break
      case 'big':
      case 'center':
        lines.push(...centre(b.text))
        break
      case 'inverse':
        lines.push(...centre(`** ${b.text} **`))
        break
      case 'text':
        lines.push(...wrapText(b.text, cols - (b.indent || 0)).map((l) => ' '.repeat(b.indent || 0) + l))
        break
      case 'row':
        lines.push(...rowText(b.left, b.right, cols, b.indent || 0))
        break
      case 'rule':
        lines.push((b.heavy ? '=' : '-').repeat(cols))
        break
      case 'gap':
        lines.push('')
        break
    }
  }
  return lines.join('\n')
}

/** ESC/POS bytes for a receipt printer with `cols` characters per line (48 on 80 mm, 32 on 58 mm). */
export function receiptEscPos(blocks: ReceiptBlock[], cols: number, opts: { cut?: boolean; kickDrawer?: boolean } = {}): Uint8Array {
  const bytes: number[] = [ESC, 0x40, ESC, 0x74, 0x00] // initialise; code page 437 (has £)
  const push = (...b: number[]) => bytes.push(...b)
  const line = (s: string) => push(...encodeText(s), 0x0a)
  const align = (n: 0 | 1 | 2) => push(ESC, 0x61, n)
  const bold = (on: boolean) => push(ESC, 0x45, on ? 1 : 0)
  const size = (n: number) => push(GS, 0x21, n) // 0x00 normal, 0x01 double height, 0x11 double both

  for (const b of blocks) {
    switch (b.t) {
      case 'title':
        align(1)
        bold(true)
        size(0x11)
        wrapText(b.text, Math.floor(cols / 2)).forEach(line)
        size(0)
        bold(false)
        align(0)
        break
      case 'big':
        align(1)
        bold(true)
        size(0x01)
        wrapText(b.text, cols).forEach(line)
        size(0)
        bold(false)
        align(0)
        break
      case 'center':
        align(1)
        if (b.bold) bold(true)
        wrapText(b.text, cols).forEach(line)
        if (b.bold) bold(false)
        align(0)
        break
      case 'inverse':
        align(1)
        bold(true)
        push(GS, 0x42, 1)
        wrapText(` ${b.text} `, cols).forEach(line)
        push(GS, 0x42, 0)
        bold(false)
        align(0)
        break
      case 'text':
        if (b.bold) bold(true)
        wrapText(b.text, cols - (b.indent || 0)).forEach((l) => line(' '.repeat(b.indent || 0) + l))
        if (b.bold) bold(false)
        break
      case 'row':
        if (b.bold) bold(true)
        if (b.big) size(0x01)
        rowText(b.left, b.right, cols, b.indent || 0).forEach(line)
        if (b.big) size(0)
        if (b.bold) bold(false)
        break
      case 'rule':
        line((b.heavy ? '=' : '-').repeat(cols))
        break
      case 'gap':
        push(0x0a)
        break
    }
  }
  if (opts.kickDrawer) push(ESC, 0x70, 0x00, 0x19, 0xfa)
  // Feed past the cutter, then a partial cut (GS V 66 n).
  push(ESC, 0x64, 0x04)
  if (opts.cut !== false) push(GS, 0x56, 0x42, 0x00)
  return new Uint8Array(bytes)
}
