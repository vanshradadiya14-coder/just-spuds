/**
 * VAT from each product's own rate.
 *
 * Every figure used to be total ÷ 6 (20% on everything), ignoring the VAT rate
 * the owner sets per product in the admin editor — and counting tips, which
 * are outside the scope of VAT. UK rules this follows:
 *  - each product carries its takeaway rate (20% hot food / drinks, 0% cold
 *    takeaway food such as a cold salad — set it per product, ask the accountant);
 *  - eaten on the premises everything is standard-rated;
 *  - a discount reduces the value of the goods it applies to (spread by value);
 *  - delivery and service charges are taxed at the standard rate;
 *  - voluntary tips are not VAT-able.
 * VAT only appears on the till and receipts when a VAT number is set.
 */
import { lineUnitPrice, type CartLine } from '../hooks/useCart'
import { getBusinessDetails, getProducts } from './menuStore'
import type { Order } from './orderStore'

export const STANDARD_RATE = 20

export interface VatBand {
  rate: number
  /** VAT-inclusive amount charged at this rate (pence). */
  gross: number
  /** VAT contained in `gross` (pence). */
  vat: number
}

export interface VatBreakdown {
  bands: VatBand[]
  vat: number
  net: number
  gross: number
}

/** VAT contained in a VAT-inclusive amount. */
export const vatIn = (gross: number, rate: number) => (rate > 0 ? Math.round((gross * rate) / (100 + rate)) : 0)

export function isVatRegistered(): boolean {
  return Boolean(getBusinessDetails().vatNumber)
}

export function computeVat(input: {
  lines: CartLine[]
  discount?: number
  /** Delivery + service charges (standard-rated). */
  charges?: number
  eatIn?: boolean
}): VatBreakdown {
  const rates = new Map(getProducts().map((p) => [p.id, typeof p.vatRate === 'number' ? p.vatRate : STANDARD_RATE]))
  const lineGross = input.lines.map((l) => ({
    gross: lineUnitPrice(l) * l.qty,
    rate: input.eatIn ? STANDARD_RATE : rates.get(l.productId) ?? STANDARD_RATE,
  }))
  const goods = lineGross.reduce((n, l) => n + l.gross, 0)
  const discount = Math.min(Math.max(0, input.discount || 0), goods)

  const byRate = new Map<number, number>()
  let discountLeft = discount
  lineGross.forEach((l, i) => {
    // Spread the discount by value; the last line takes the rounding remainder.
    const share = i === lineGross.length - 1 ? discountLeft : goods > 0 ? Math.round((discount * l.gross) / goods) : 0
    discountLeft -= share
    byRate.set(l.rate, (byRate.get(l.rate) || 0) + Math.max(0, l.gross - share))
  })
  if (input.charges && input.charges > 0) byRate.set(STANDARD_RATE, (byRate.get(STANDARD_RATE) || 0) + input.charges)

  const bands = [...byRate.entries()]
    .filter(([, gross]) => gross > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([rate, gross]) => ({ rate, gross, vat: vatIn(gross, rate) }))
  const vat = bands.reduce((n, b) => n + b.vat, 0)
  const gross = bands.reduce((n, b) => n + b.gross, 0)
  return { bands, vat, net: gross - vat, gross }
}

/** Was this order eaten on the premises? (till "Eat in", or a table number) */
export function isEatIn(order: Pick<Order, 'kitchenNotes' | 'customer'>): boolean {
  return Boolean(order.customer?.tableNumber) || /EAT[_ ]IN/i.test(order.kitchenNotes || '')
}

export function orderVat(order: Order): VatBreakdown {
  return computeVat({
    lines: order.lines,
    discount: order.payment.discount,
    charges: (order.payment.deliveryFee || 0) + (order.payment.serviceFee || 0),
    eatIn: isEatIn(order),
  })
}

/** Sum of several orders' VAT, merged by rate. */
export function ordersVat(orders: Order[]): VatBreakdown {
  const byRate = new Map<number, VatBand>()
  orders.forEach((o) => {
    orderVat(o).bands.forEach((b) => {
      const prev = byRate.get(b.rate) || { rate: b.rate, gross: 0, vat: 0 }
      byRate.set(b.rate, { rate: b.rate, gross: prev.gross + b.gross, vat: prev.vat + b.vat })
    })
  })
  const bands = [...byRate.values()].sort((a, b) => b.rate - a.rate)
  const vat = bands.reduce((n, b) => n + b.vat, 0)
  const gross = bands.reduce((n, b) => n + b.gross, 0)
  return { bands, vat, net: gross - vat, gross }
}
