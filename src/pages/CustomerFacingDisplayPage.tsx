import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { subscribeCFDState, type CFDTicketState, EMPTY_CFD_STATE } from '../services/cfdBus'
import { lineUnitPrice } from '../hooks/useCart'
import { gbp } from '../utils/format'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { SITE } from '../data/site'

export default function CustomerFacingDisplayPage() {
  useDocumentMeta({
    title: 'Customer Display | Just Spuds',
    description: 'Real-time customer-facing counter display for order review and contactless payment.',
  })

  const [state, setState] = useState<CFDTicketState>(() => EMPTY_CFD_STATE)

  useEffect(() => {
    return subscribeCFDState((st) => setState(st))
  }, [])

  const hasItems = state.lines.length > 0
  const isPaid = state.status === 'paid'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-body flex flex-col select-none overflow-hidden">
      {/* Top Status Bar */}
      <header className="h-16 px-6 bg-slate-900 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-ink font-black text-lg shadow-glow">
            🥔
          </div>
          <div>
            <h1 className="display text-base font-black tracking-wide text-white">
              {SITE.name}
            </h1>
            <p className="text-[11px] text-white/60 font-medium">Market Square &bull; Aylesbury</p>
          </div>
        </div>

        {/* Order Badges (Type, Buzzer, Table) */}
        <div className="flex items-center gap-2">
          {state.buzzerNumber && (
            <div className="rounded-xl border border-amber-400 bg-amber-400/20 px-3 py-1 font-mono text-xs font-black text-amber-300 flex items-center gap-1.5 animate-pulse">
              <span>🔔</span>
              <span>BUZZER #{state.buzzerNumber}</span>
            </div>
          )}

          {state.tableNumber && (
            <div className="rounded-xl border border-indigo-400 bg-indigo-500/20 px-3 py-1 font-mono text-xs font-black text-indigo-300 flex items-center gap-1.5">
              <span>🪑</span>
              <span>TABLE #{state.tableNumber}</span>
            </div>
          )}

          <div className="rounded-xl bg-white/10 px-3 py-1 font-body text-xs font-bold uppercase tracking-wider text-white">
            {state.orderType === 'eat_in' ? '🍽️ Dine In' : state.orderType === 'phone' ? '📞 Phone Collection' : '🛍️ Takeaway'}
          </div>

          <Link
            to="/pos"
            className="text-[10px] text-white/30 hover:text-white/70 ml-2"
            title="Open Cashier POS Till"
          >
            Terminal ↗
          </Link>
        </div>
      </header>

      {/* Main Split Screen */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
        {/* Left Hero & Promotions (5 cols) */}
        <div className="md:col-span-5 bg-gradient-to-b from-slate-900 via-amber-950/20 to-black p-8 flex flex-col justify-between border-r border-white/10">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3.5 py-1 text-xs font-bold text-amber-300">
              <span>✨</span>
              <span>Oven-Baked Fresh Daily</span>
            </div>

            <div className="space-y-2">
              <h2 className="display text-3xl sm:text-4xl font-black text-white leading-tight">
                Authentic British <span className="text-amber-400">Jacket Potatoes</span>
              </h2>
              <p className="text-sm text-white/70 leading-relaxed">
                Crispy sea-salted King Edward skins packed with rich melted fillings, fresh salads, and house sauces.
              </p>
            </div>

            {/* Meal Deal Banner */}
            <div className="rounded-3xl border border-amber-400/30 bg-gradient-to-r from-amber-500/15 to-orange-500/15 p-4 shadow-lg space-y-1">
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase text-ink">
                  Deal Saver
                </span>
                <span className="font-mono text-xs font-bold text-amber-300">+£1.80 Only</span>
              </div>
              <h3 className="font-black text-sm text-white">Upgrade to a Meal Deal</h3>
              <p className="text-xs text-white/60">
                Add any cold drink can + Walkers crisp snack to your spud or wrap and save!
              </p>
            </div>
          </div>

          {/* Customer Assistance Footer */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-xs text-white/60 space-y-1">
            <p className="font-bold text-white flex items-center gap-1.5">
              <span>🌱</span>
              <span>Dietary or Allergen requirements?</span>
            </p>
            <p>Please notify our team at the counter before completing your order.</p>
          </div>
        </div>

        {/* Right Live Itemized Basket & Payment Display (7 cols) */}
        <div className="md:col-span-7 bg-black flex flex-col justify-between h-full">
          {/* Basket Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-slate-950">
            <span className="font-black text-xs uppercase tracking-wider text-white/60">
              Your Order Summary ({state.lines.reduce((a, b) => a + b.qty, 0)} items)
            </span>
            {state.customerName && (
              <span className="font-bold text-xs text-amber-300">
                Guest: {state.customerName}
              </span>
            )}
          </div>

          {/* Line Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {!hasItems ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-white/40 space-y-3">
                <span className="text-5xl">🥔</span>
                <p className="text-base font-bold text-white/80">Welcome to Just Spuds!</p>
                <p className="text-xs max-w-xs">Your items will appear here as the cashier rings them up.</p>
              </div>
            ) : (
              state.lines.map((line) => {
                const totalItemPrice = lineUnitPrice(line) * line.qty
                return (
                  <div
                    key={line.lineId}
                    className="rounded-2xl border border-white/10 bg-slate-900/80 p-3 flex items-start justify-between gap-3 shadow-sm transition animate-fadeIn"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-400/20 font-mono text-xs font-black text-amber-300">
                          {line.qty}x
                        </span>
                        <h4 className="font-bold text-sm text-white">{line.name}</h4>
                      </div>

                      {/* Conversational Modifiers Display */}
                      {line.conversationalModifiers && line.conversationalModifiers.length > 0 && (
                        <div className="flex flex-wrap gap-1 pl-8">
                          {line.conversationalModifiers.map((mod, idx) => {
                            let badgeStyle = 'bg-white/10 text-white/80 border-white/10'
                            if (mod.type === 'extra') badgeStyle = 'bg-amber-400/20 text-amber-300 border-amber-400/40 font-black'
                            if (mod.type === 'no') badgeStyle = 'bg-red-500/20 text-red-300 border-red-500/40 font-bold line-through'
                            if (mod.type === 'lite') badgeStyle = 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            if (mod.type === 'side') badgeStyle = 'bg-purple-500/20 text-purple-300 border-purple-500/40'

                            return (
                              <span
                                key={idx}
                                className={`rounded-md border px-2 py-0.5 text-[10px] uppercase ${badgeStyle}`}
                              >
                                {mod.type === 'extra' && '+ '}
                                {mod.type === 'no' && 'NO '}
                                {mod.type === 'lite' && 'LITE '}
                                {mod.name}
                                {mod.type === 'side' && ' (ON SIDE)'}
                              </span>
                            )
                          })}
                        </div>
                      )}

                      {/* Extras & Sauces */}
                      {line.extras && line.extras.length > 0 && (
                        <p className="text-[11px] text-white/60 pl-8">
                          + {line.extras.map((e) => e.replace(/-/g, ' ')).join(', ')}
                        </p>
                      )}

                      {line.sauces && line.sauces.length > 0 && (
                        <p className="text-[11px] text-white/60 pl-8">
                          Sauce: {line.sauces.join(', ')}
                        </p>
                      )}

                      {/* Meal Deal */}
                      {line.meal && (
                        <div className="rounded-lg bg-amber-500/10 border border-amber-400/30 px-2 py-1 text-[11px] text-amber-300 font-bold ml-8 inline-block">
                          ✓ MEAL DEAL COMBO: {line.mealDrink?.replace(/-/g, ' ')} &bull; {line.mealSnack?.replace(/-/g, ' ')}
                        </div>
                      )}
                    </div>

                    <span className="font-mono text-sm font-black text-white shrink-0">
                      {gbp(totalItemPrice)}
                    </span>
                  </div>
                )
              })
            )}
          </div>

          {/* Payment & Totals Footer */}
          <div className="p-5 border-t border-white/10 bg-slate-950 space-y-3 shrink-0">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-white/60">
                <span>Subtotal</span>
                <span className="font-mono font-bold text-white">{gbp(state.subtotalPence)}</span>
              </div>
              {state.discountPence > 0 && (
                <div className="flex justify-between font-bold text-amber-400">
                  <span>Discount Applied</span>
                  <span className="font-mono">-{gbp(state.discountPence)}</span>
                </div>
              )}
              <div className="flex justify-between text-white/40 text-[11px]">
                <span>UK VAT @ 20% Included</span>
                <span className="font-mono">{gbp(Math.round((state.totalDuePence / 1.2) * 0.2))}</span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-white/15">
                <span className="display text-lg font-black uppercase text-white">TOTAL DUE</span>
                <span className="font-mono text-3xl sm:text-4xl font-black text-amber-400">
                  {gbp(state.totalDuePence)}
                </span>
              </div>
            </div>

            {/* Dynamic Status / Instruction Banner */}
            {isPaid ? (
              <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-950/80 p-4 text-center space-y-1 shadow-glow animate-bounce">
                <div className="text-2xl">🎉</div>
                <h4 className="display text-base font-black text-emerald-300">
                  PAYMENT SUCCESSFUL &bull; ORDER #{state.completedOrderShortId}
                </h4>
                <p className="text-xs text-white/80">
                  Thank you! Your hot food is now oven-baking fresh in the kitchen.
                  {state.buzzerNumber && <strong className="block text-amber-300 mt-1">Please keep Buzzer #{state.buzzerNumber} handy.</strong>}
                </p>
                {state.changeDuePence && state.changeDuePence > 0 ? (
                  <p className="text-sm font-black text-emerald-300 pt-1">
                    CASH CHANGE DUE: {gbp(state.changeDuePence)}
                  </p>
                ) : null}
              </div>
            ) : state.status === 'tender' ? (
              <div className="rounded-2xl border border-blue-400 bg-blue-950/60 p-3.5 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 text-sm font-black text-blue-300">
                  <span>💳</span>
                  <span>Please Tap Card, Phone, or Hand Cash to Cashier</span>
                </div>
                <p className="text-[11px] text-white/60">Contactless, Apple Pay, Google Pay, and Cash accepted.</p>
              </div>
            ) : hasItems ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center text-xs text-white/60">
                Please review your order with the cashier &bull; Modifiers &amp; sides itemized above
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
