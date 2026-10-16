/**
 * END-OF-DAY (Z) / X REPORT
 * -------------------------
 * Builds the printed till report the shop used to get from EPOS Now, from a
 * till shift and the orders it took:
 *
 *   Tender (counted / expected / variance) · Sales breakdown · Wet/Dry ·
 *   Sales by product · Sales by employee · Refunds · Sales by category ·
 *   Voids · Tax · Sales by hour
 *
 * Toppings and the meal deal are reported as their own lines (like EPOS lists
 * "Beans", "Cheese", "Make It A Meal"), so the owner can see what sells.
 *
 * Pure: everything it needs is passed in, so the same function gives the live
 * X-read during the day and the frozen Z-report stored on the closed shift.
 */
import { MEAL_DEAL, CATEGORIES, optionLabel, optionPrice, type Product, type Category } from '../data/menu'
import { lineUnitPrice, type CartLine } from '../hooks/useCart'
import type { Order } from './orderStore'
import { movementKind, type TillShift, type TillVoidRecord } from './tillStore'
import { STANDARD_RATE } from './vat'

export interface ReportRow {
  key: string
  label: string
  qty: number
  /** Discount spread onto this row (pence). */
  discount: number
  /** Excluding VAT (pence). */
  net: number
  tax: number
  /** What the customer paid for it, after discount (pence). */
  total: number
  /** Share of total sales, 0–100. */
  share: number
}

export interface TenderRow {
  key: 'cash' | 'card' | 'other'
  label: string
  /** Taken on the till (sales − refunds), pence. */
  taken: number
  /** Counted at close (cash drawer / card machine / link total); undefined = not counted. */
  counted?: number
  variance?: number
}

export interface RefundEntry {
  at: string
  orderShortId?: string
  amount: number
  method: 'cash' | 'card'
  reason: string
  staff: string
}

export interface EndOfDayReport {
  version: 1
  kind: 'Z' | 'X'
  generatedAt: string
  tillName: string
  shiftNumber: number
  openedBy: string
  openedAt: string
  closedBy?: string
  closedAt?: string
  note?: string
  vatRegistered: boolean
  /** 'sales' = built from the till's own sale log; 'time' = older shift, rebuilt from orders paid in the shift window. */
  basis: 'sales' | 'time'

  drawer: {
    float: number
    /** Float top-ups minus bank drops (pence; negative = withdrawn). */
    floatAdjust: number
    petty: number
    tipOuts: number
    cashSales: number
    cashRefunds: number
    expected: number
    counted?: number
    variance?: number
    noSales: number
  }
  tenders: TenderRow[]
  takings: { taken: number; counted?: number; variance?: number }

  sales: {
    transactions: number
    items: number
    /** Before discounts (pence). */
    gross: number
    discount: number
    /** After discounts, excl. tips (pence). */
    total: number
    net: number
    tax: number
    average: number
    tips: number
    refunds: number
  }
  wetDry: ReportRow[]
  byProduct: ReportRow[]
  byCategory: ReportRow[]
  byEmployee: (ReportRow & { transactions: number; tips: number })[]
  byHour: { hour: number; transactions: number; total: number }[]
  tax: { rate: number; label: string; qty: number; net: number; tax: number; gross: number; share: number }[]
  refunds: RefundEntry[]
  voids: TillVoidRecord[]
  website: { orders: number; total: number }
}

export interface BuildReportInput {
  shift: TillShift
  orders: Order[]
  products: Product[]
  categories?: Category[]
  vatRegistered: boolean
  kind?: 'Z' | 'X'
  now?: Date
}

const WET_CATEGORIES = new Set(['HOT_DRINKS', 'COLD_DRINKS'])
const EXTRA_CATEGORIES: Record<string, string> = {
  TOPPINGS: 'Toppings',
  MEAL_DEALS: 'Meal deals',
  CUSTOM: 'Manual items',
  CHARGES: 'Charges',
}

/** One sellable piece of a line: the product itself, a topping, the meal deal… */
interface Component {
  key: string
  label: string
  category: string
  /** Line qty × this component's unit price (pence). */
  gross: number
  qty: number
  rate: number
}

const vatOf = (gross: number, rate: number) => (rate > 0 ? Math.round((gross * rate) / (100 + rate)) : 0)

function lineComponents(line: CartLine, rate: number): Component[] {
  const q = Math.max(0, line.qty || 0)
  if (typeof line.priceOverridePence === 'number') {
    return [{ key: `product:${line.productId}`, label: line.name, category: line.category || 'CUSTOM', gross: line.priceOverridePence * q, qty: q, rate }]
  }
  const parts: Component[] = [
    {
      key: line.category === 'CUSTOM' ? `custom:${line.name.toLowerCase()}` : `product:${line.productId}`,
      label: line.name,
      category: line.category || 'CUSTOM',
      gross: line.base * q,
      qty: q,
      rate,
    },
  ]
  for (const id of line.extras || []) {
    const unit = optionPrice(id, line.category)
    parts.push({ key: `topping:${id}`, label: optionLabel(id), category: 'TOPPINGS', gross: unit * q, qty: q, rate })
  }
  for (const m of line.conversationalModifiers || []) {
    const unit = m.pricePence || (m.type === 'extra' ? 100 : 0)
    if (unit > 0) parts.push({ key: `topping:extra-${m.name.toLowerCase()}`, label: `Extra ${m.name}`, category: 'TOPPINGS', gross: unit * q, qty: q, rate })
  }
  if (line.meal) parts.push({ key: 'meal-deal', label: 'Make It A Meal', category: 'MEAL_DEALS', gross: MEAL_DEAL.price * q, qty: q, rate })
  // Anything lineUnitPrice charges that the parts above do not explain stays on the product line.
  const charged = lineUnitPrice(line) * q
  const explained = parts.reduce((n, p) => n + p.gross, 0)
  if (charged !== explained) parts[0].gross += charged - explained
  return parts
}

/** Spread an order-level discount over its components by value; the last one takes the rounding remainder. */
function spreadDiscount(parts: Component[], discount: number): number[] {
  const goods = parts.reduce((n, p) => n + p.gross, 0)
  const capped = Math.min(Math.max(0, discount), goods)
  let left = capped
  return parts.map((p, i) => {
    const share = i === parts.length - 1 ? left : goods > 0 ? Math.round((capped * p.gross) / goods) : 0
    left -= share
    return share
  })
}

const isEatInOrder = (o: Pick<Order, 'kitchenNotes' | 'customer'>) =>
  Boolean(o.customer?.tableNumber) || /EAT[_ ]IN/i.test(o.kitchenNotes || '')

function addTo(map: Map<string, ReportRow>, key: string, label: string, qty: number, discount: number, gross: number, tax: number) {
  const row = map.get(key) || { key, label, qty: 0, discount: 0, net: 0, tax: 0, total: 0, share: 0 }
  row.qty += qty
  row.discount += discount
  row.total += gross
  row.tax += tax
  row.net = row.total - row.tax
  map.set(key, row)
}

function finish(map: Map<string, ReportRow>, grandTotal: number): ReportRow[] {
  return [...map.values()]
    .map((r) => ({ ...r, share: grandTotal > 0 ? Math.round((r.total / grandTotal) * 10000) / 100 : 0 }))
    .sort((a, b) => b.total - a.total || b.qty - a.qty || a.label.localeCompare(b.label))
}

/** Which orders this shift sold, oldest first. */
function shiftOrders(shift: TillShift, orders: Order[]): { order: Order; staff: string; tip: number }[] {
  const byId = new Map<string, Order>()
  orders.forEach((o) => {
    byId.set(o.id, o)
    byId.set(o.shortId, o)
  })
  if (shift.sales && shift.sales.length > 0) {
    const seen = new Set<string>()
    const out: { order: Order; staff: string; tip: number }[] = []
    for (const s of shift.sales) {
      const order = byId.get(s.orderId) || byId.get(s.shortId)
      if (!order || seen.has(order.id) || order.isTest) continue
      seen.add(order.id)
      out.push({ order, staff: s.staff || order.payment.takenBy || 'Staff', tip: s.tip || order.payment.tip || 0 })
    }
    return out
  }
  // Shifts closed before the till kept a sale log: orders paid at the counter inside the shift window.
  const from = shift.openedAt
  const to = shift.closedAt || new Date().toISOString()
  return orders
    .filter((o) => !o.isTest && o.source !== 'WEBSITE')
    .filter((o) => o.payment.status === 'paid' || o.payment.status === 'refunded')
    .filter((o) => {
      const at = o.payment.paidAt || o.createdAt
      return at >= from && at <= to
    })
    .sort((a, b) => (a.payment.paidAt || a.createdAt).localeCompare(b.payment.paidAt || b.createdAt))
    .map((order) => ({ order, staff: order.payment.takenBy || 'Staff', tip: order.payment.tip || 0 }))
}

export function buildEndOfDayReport(input: BuildReportInput): EndOfDayReport {
  const { shift, orders, products, vatRegistered } = input
  const now = input.now || new Date()
  const kind = input.kind || (shift.status === 'closed' ? 'Z' : 'X')
  const categoryLabels = new Map<string, string>([
    ...(input.categories || CATEGORIES).map((c): [string, string] => [c.id, c.label]),
    ...Object.entries(EXTRA_CATEGORIES),
  ])
  const rates = new Map(products.map((p) => [p.id, typeof p.vatRate === 'number' ? p.vatRate : STANDARD_RATE]))

  const sold = shiftOrders(shift, orders)

  const productRows = new Map<string, ReportRow>()
  const categoryRows = new Map<string, ReportRow>()
  const wetDryRows = new Map<string, ReportRow>()
  const employeeRows = new Map<string, ReportRow & { transactions: number; tips: number }>()
  const taxRows = new Map<number, { rate: number; label: string; qty: number; net: number; tax: number; gross: number; share: number }>()
  const hourRows = new Map<number, { hour: number; transactions: number; total: number }>()

  let gross = 0
  let discountTotal = 0
  let taxTotal = 0
  let items = 0
  let tips = 0

  for (const { order, staff, tip } of sold) {
    const eatIn = isEatInOrder(order)
    const parts: Component[] = []
    for (const line of order.lines) {
      const rate = eatIn ? STANDARD_RATE : rates.get(line.productId) ?? STANDARD_RATE
      parts.push(...lineComponents(line, rate))
      items += Math.max(0, line.qty || 0)
    }
    const charges = (order.payment.deliveryFee || 0) + (order.payment.serviceFee || 0)
    if (charges > 0) parts.push({ key: 'charges', label: 'Delivery / service charges', category: 'CHARGES', gross: charges, qty: 1, rate: STANDARD_RATE })

    const discounts = spreadDiscount(parts, order.payment.discount || 0)
    const afterDiscount = parts.map((p, i) => Math.max(0, p.gross - discounts[i]))
    // VAT is worked out per rate on the whole order (as on the receipt), then
    // shared across that rate's lines — rounding each line would drift by pennies.
    const partTax = new Array<number>(parts.length).fill(0)
    if (vatRegistered) {
      const rateGroups = new Map<number, number[]>()
      parts.forEach((p, i) => rateGroups.set(p.rate, [...(rateGroups.get(p.rate) || []), i]))
      rateGroups.forEach((idx, rate) => {
        const groupGross = idx.reduce((n, i) => n + afterDiscount[i], 0)
        let left = vatOf(groupGross, rate)
        const total = left
        idx.forEach((i, k) => {
          const share = k === idx.length - 1 ? left : groupGross > 0 ? Math.round((total * afterDiscount[i]) / groupGross) : 0
          partTax[i] = share
          left -= share
        })
      })
    }
    let orderTotal = 0
    let orderTax = 0
    parts.forEach((p, i) => {
      const after = afterDiscount[i]
      const tax = partTax[i]
      gross += p.gross
      discountTotal += discounts[i]
      taxTotal += tax
      orderTotal += after
      orderTax += tax

      addTo(productRows, p.key, p.label, p.qty, discounts[i], after, tax)
      addTo(categoryRows, p.category, categoryLabels.get(p.category) || p.category, p.qty, discounts[i], after, tax)
      const wet = WET_CATEGORIES.has(p.category)
      addTo(wetDryRows, wet ? 'wet' : 'dry', wet ? 'Wet (drinks)' : 'Dry (food)', p.qty, discounts[i], after, tax)

      const rateKey = vatRegistered ? p.rate : -1
      const tr = taxRows.get(rateKey) || {
        rate: rateKey,
        label: !vatRegistered ? 'No VAT (not registered)' : p.rate > 0 ? `VAT ${p.rate}%` : 'Zero-rated 0%',
        qty: 0,
        net: 0,
        tax: 0,
        gross: 0,
        share: 0,
      }
      tr.qty += p.qty
      tr.gross += after
      tr.tax += tax
      tr.net = tr.gross - tr.tax
      taxRows.set(rateKey, tr)
    })

    tips += tip
    const emp = employeeRows.get(staff) || { key: staff, label: staff, qty: 0, discount: 0, net: 0, tax: 0, total: 0, share: 0, transactions: 0, tips: 0 }
    emp.transactions += 1
    emp.qty += order.lines.reduce((n, l) => n + Math.max(0, l.qty || 0), 0)
    emp.discount += Math.min(order.payment.discount || 0, parts.reduce((n, p) => n + p.gross, 0))
    emp.total += orderTotal
    emp.tax += orderTax
    emp.net = emp.total - emp.tax
    emp.tips += tip
    employeeRows.set(staff, emp)

    const hour = new Date(order.payment.paidAt || order.createdAt).getHours()
    const hr = hourRows.get(hour) || { hour, transactions: 0, total: 0 }
    hr.transactions += 1
    hr.total += orderTotal
    hourRows.set(hour, hr)
  }

  const salesTotal = gross - discountTotal

  // ---------------------------------------------------------------- drawer
  const movements = shift.movements || []
  const sum = (pred: (m: (typeof movements)[number]) => boolean) => movements.filter(pred).reduce((n, m) => n + (m.amount || 0), 0)
  const floatIn = sum((m) => m.type === 'pay_in' && movementKind(m) === 'float')
  const floatOut = sum((m) => m.type === 'pay_out' && movementKind(m) === 'float')
  const petty = sum((m) => m.type === 'pay_out' && movementKind(m) === 'petty')
  const tipOuts = sum((m) => m.type === 'pay_out' && movementKind(m) === 'tip_out')
  const cashRefunds = sum((m) => m.type === 'refund_cash')
  const cardRefunds = sum((m) => m.type === 'refund_card')
  const noSales = movements.filter((m) => m.type === 'no_sale_pop').length

  const counted = typeof shift.countedCash === 'number' && shift.status === 'closed' ? shift.countedCash : undefined
  const drawer = {
    float: shift.startingFloat,
    floatAdjust: floatIn - floatOut,
    petty,
    tipOuts,
    cashSales: shift.cashSalesTotal,
    cashRefunds,
    expected: shift.expectedCash,
    counted,
    variance: typeof counted === 'number' ? counted - shift.expectedCash : undefined,
    noSales,
  }

  // --------------------------------------------------------------- tenders
  const cashTaken = shift.cashSalesTotal - cashRefunds
  const cardTaken = shift.cardSalesTotal - cardRefunds
  const otherTaken = shift.otherTenderTotal || 0
  // Cash is reconciled through the drawer above; the tender line compares takings only.
  const cashCountedTakings = typeof counted === 'number' ? counted - (shift.expectedCash - cashTaken) : undefined
  const tenders: TenderRow[] = [
    { key: 'cash', label: 'Cash', taken: cashTaken, counted: cashCountedTakings, variance: typeof cashCountedTakings === 'number' ? cashCountedTakings - cashTaken : undefined },
    {
      key: 'card',
      label: 'Card',
      taken: cardTaken,
      counted: shift.countedCard,
      variance: typeof shift.countedCard === 'number' ? shift.countedCard - cardTaken : undefined,
    },
  ]
  if (otherTaken > 0 || typeof shift.countedOther === 'number') {
    tenders.push({
      key: 'other',
      label: 'Payment link',
      taken: otherTaken,
      counted: shift.countedOther,
      variance: typeof shift.countedOther === 'number' ? shift.countedOther - otherTaken : undefined,
    })
  }
  const takenTotal = tenders.reduce((n, t) => n + t.taken, 0)
  const allCounted = tenders.every((t) => typeof t.counted === 'number' || t.taken === 0)
  const countedTotal = allCounted ? tenders.reduce((n, t) => n + (t.counted ?? 0), 0) : undefined

  // --------------------------------------------------------------- refunds
  const refunds: RefundEntry[] = movements
    .filter((m) => m.type === 'refund_cash' || m.type === 'refund_card')
    .map((m) => ({
      at: m.timestamp,
      orderShortId: m.orderId,
      amount: m.amount,
      method: m.type === 'refund_cash' ? 'cash' : 'card',
      reason: m.reason.replace(/^Refund Order #[^:]+:\s*/, ''),
      staff: m.staffName,
    }))

  const taxList = [...taxRows.values()]
    .map((t) => ({ ...t, share: salesTotal > 0 ? Math.round((t.gross / salesTotal) * 10000) / 100 : 0 }))
    .sort((a, b) => b.rate - a.rate)

  return {
    version: 1,
    kind,
    generatedAt: now.toISOString(),
    tillName: shift.tillName || 'Till 1',
    shiftNumber: shift.shiftNumber,
    openedBy: shift.openedBy,
    openedAt: shift.openedAt,
    closedBy: shift.closedBy,
    closedAt: shift.closedAt,
    note: shift.notes,
    vatRegistered,
    basis: shift.sales && shift.sales.length > 0 ? 'sales' : 'time',
    drawer,
    tenders,
    takings: {
      taken: takenTotal,
      counted: countedTotal,
      variance: typeof countedTotal === 'number' ? countedTotal - takenTotal : undefined,
    },
    sales: {
      transactions: sold.length,
      items,
      gross,
      discount: discountTotal,
      total: salesTotal,
      net: salesTotal - taxTotal,
      tax: taxTotal,
      average: sold.length > 0 ? Math.round(salesTotal / sold.length) : 0,
      tips,
      refunds: cashRefunds + cardRefunds,
    },
    wetDry: finish(wetDryRows, salesTotal),
    byProduct: finish(productRows, salesTotal),
    byCategory: finish(categoryRows, salesTotal),
    byEmployee: [...employeeRows.values()]
      .map((e) => ({ ...e, share: salesTotal > 0 ? Math.round((e.total / salesTotal) * 10000) / 100 : 0 }))
      .sort((a, b) => b.total - a.total),
    byHour: [...hourRows.values()].sort((a, b) => a.hour - b.hour),
    tax: taxList,
    refunds,
    voids: [...(shift.voids || [])],
    website: { orders: shift.onlineOrdersCount || 0, total: shift.onlineOrdersTotal || 0 },
  }
}
