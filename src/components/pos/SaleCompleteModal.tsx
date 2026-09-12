import { useEffect, useRef, useState } from 'react'
import { recordReceiptDelivery, type Order } from '../../services/orderStore'
import { lineUnitPrice } from '../../hooks/useCart'
import { gbp } from '../../utils/format'
import { SITE } from '../../data/site'

interface SaleCompleteModalProps {
  order: Order
  changeDuePence: number
  tenderLabel: string
  actor: string
  /** The till already opened the receipt (auto-print setting), so skip the prompt. */
  autoPrinted?: boolean
  onPrint: (order: Order) => void
  /** Dismisses the screen and starts the next sale. */
  onNewSale: () => void
}

function plainTextReceipt(order: Order): string {
  const lines = order.lines.map((l) => `${l.qty} x ${l.name.padEnd(28)} ${gbp(lineUnitPrice(l) * l.qty)}`)
  return [
    `${SITE.name} — Receipt #${order.shortId}`,
    new Date(order.createdAt).toLocaleString('en-GB'),
    '',
    ...lines,
    '',
    `Subtotal  ${gbp(order.payment.subtotal)}`,
    order.payment.discount > 0 ? `Discount  -${gbp(order.payment.discount)}` : null,
    order.payment.tip > 0 ? `Tip       ${gbp(order.payment.tip)}` : null,
    `TOTAL     ${gbp(order.payment.total)}`,
    `Paid by ${order.payment.method.replace(/_/g, ' ')}`,
    '',
    'Thank you — see you again soon.',
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
}

export default function SaleCompleteModal({ order, changeDuePence, tenderLabel, actor, autoPrinted = false, onPrint, onNewSale }: SaleCompleteModalProps) {
  const [emailOpen, setEmailOpen] = useState(false)
  const [email, setEmail] = useState(order.customer.email?.endsWith('@justspuds.uk') ? '' : order.customer.email || '')
  const [done, setDone] = useState<string | null>(autoPrinted ? 'Receipt printed automatically' : null)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (emailOpen) emailRef.current?.focus()
  }, [emailOpen])

  // Enter starts the next sale so the cashier never has to reach for the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !emailOpen) {
        e.preventDefault()
        onNewSale()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [emailOpen, onNewSale])

  const print = () => {
    recordReceiptDelivery(order.id, 'print', undefined, actor)
    onPrint(order)
    setDone('Receipt sent to printer')
  }

  const sendEmail = () => {
    const clean = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return
    recordReceiptDelivery(order.id, 'email', clean, actor)
    const subject = encodeURIComponent(`Your ${SITE.name} receipt #${order.shortId}`)
    const body = encodeURIComponent(plainTextReceipt(order))
    window.open(`mailto:${clean}?subject=${subject}&body=${body}`, '_self')
    setEmailOpen(false)
    setDone(`Receipt emailed to ${clean}`)
  }

  const noReceipt = () => {
    recordReceiptDelivery(order.id, 'none', undefined, actor)
    onNewSale()
  }

  const isCash = order.payment.method === 'cash' || (order.payment.method === 'split' && changeDuePence > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl border border-emerald-400/40 bg-slate-900 p-6 shadow-2xl text-white font-body text-center space-y-5">
        <div>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-3xl text-ink shadow-glow">✓</div>
          <h3 className="mt-3 display text-2xl font-bold">Sale complete</h3>
          <p className="text-xs text-white/50 mt-0.5">
            Order <span className="font-mono font-bold text-amber-300">#{order.shortId}</span>
            {order.customer.buzzerNumber && <> &bull; Buzzer <span className="font-bold text-amber-300">{order.customer.buzzerNumber}</span></>}
            {' '}&bull; {tenderLabel}
          </p>
        </div>

        {isCash ? (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-950/40 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/80">Change due</p>
            <p className="font-mono text-5xl font-black text-emerald-300 mt-1">{gbp(changeDuePence)}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Total charged</p>
            <p className="font-mono text-4xl font-black text-white mt-1">{gbp(order.payment.total)}</p>
            {order.payment.tip > 0 && <p className="text-[11px] text-emerald-300 mt-1">includes {gbp(order.payment.tip)} tip</p>}
          </div>
        )}

        {done ? (
          <div className="space-y-2">
            <p className="text-xs font-bold text-emerald-300">✓ {done}</p>
            <button type="button" onClick={() => onPrint(order)} className="text-[11px] text-white/50 hover:text-white underline">
              Reprint
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Receipt?</p>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={print} className="rounded-xl border border-white/15 bg-white/10 py-3 text-xs font-bold text-white hover:bg-white/20">
                🖨️ Print
              </button>
              <button type="button" onClick={() => setEmailOpen((v) => !v)} className="rounded-xl border border-white/15 bg-white/10 py-3 text-xs font-bold text-white hover:bg-white/20">
                ✉️ Email
              </button>
              <button type="button" onClick={noReceipt} className="rounded-xl border border-white/15 bg-white/5 py-3 text-xs font-bold text-white/70 hover:bg-white/15">
                No receipt
              </button>
            </div>
            {emailOpen && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  sendEmail()
                }}
                className="flex gap-2"
              >
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="customer@email.com"
                  className="flex-1 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
                <button type="submit" className="rounded-xl bg-amber-400 px-4 text-xs font-black text-ink hover:bg-amber-300">
                  Send
                </button>
              </form>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onNewSale}
          className="w-full rounded-2xl bg-emerald-500 py-3.5 text-sm font-black uppercase tracking-wider text-ink shadow-glow hover:bg-emerald-400"
        >
          New sale <span className="ml-2 rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px]">↵</span>
        </button>
      </div>
    </div>
  )
}
