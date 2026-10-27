import { useEffect, useMemo, useState } from 'react'
import { FRESH_SALAD_OPTIONS, MEAL_DEAL, extrasFor, optionLabel, type Product } from '../../data/menu'
import { getSauces } from '../../services/menuStore'
import { playPOSTouchTone } from '../../services/printerBridge'
import type { CartLine, CartLineModifier } from '../../hooks/useCart'
import { gbp } from '../../utils/format'
import { stationForLine } from '../../utils/lineText'

/**
 * EPOS-style item pop-up: Complimentary → Toppings → Fresh Salad → Sauces → Make It A Meal,
 * with Previous / Next, an Express single-screen toggle for high-speed cashiers,
 * and an Add button that is always one tap away.
 *
 * Prices come from the shop's menu (the same topping list the website uses),
 * so a topping costs the same here, online and on the end-of-day report.
 */

type Butter = 'real' | 'garlic' | 'vegan' | 'none'
type StepId = 'free' | 'toppings' | 'salads' | 'sauces' | 'meal'

const SALAD_ELIGIBLE_CATEGORIES = new Set(['SPUDS', 'WRAPS', 'RICE_BOXES', 'BAGUETTES', 'PANINIS', 'SALADS'])
const WIZARD_MODE_KEY = 'just_spuds_pos_wizard_mode_v1'

const BUTTERS: { id: Butter; label: string }[] = [
  { id: 'real', label: 'Real butter' },
  { id: 'garlic', label: 'Garlic butter' },
  { id: 'vegan', label: 'Vegan spread' },
  { id: 'none', label: 'No butter' },
]

/** Free "leave it off" choices per category (EPOS "Complimentary"). */
const LEAVE_OFF: Record<string, string[]> = {
  SPUDS: ['Salt', 'Pepper'],
  BAGUETTES: ['Butter', 'Salad', 'Mayo'],
  PANINIS: ['Butter'],
  WRAPS: ['Salad', 'Onion', 'Sauce'],
  RICE_BOXES: ['Salad', 'Onion', 'Sauce'],
  SALADS: ['Onion', 'Dressing'],
}

const KITCHEN_REQUESTS: Record<string, string[]> = {
  SPUDS: ['Extra crispy skin', 'Well done', 'Cut in half', 'Toppings on the side'],
  BAGUETTES: ['Cut in half', 'Well toasted'],
  PANINIS: ['Well toasted', 'Cut in half'],
  WRAPS: ['Well toasted', 'Cut in half'],
  RICE_BOXES: ['Sauce on the side'],
  SALADS: ['Dressing on the side'],
}

export const stationFor = (category: string): CartLine['station'] =>
  stationForLine({ category: category as Product['category'] })

const titleCase = (s: string) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** The base topping ids a dish comes with, as "leave off" names (butter is its own control). */
function baseToppingNames(product: Product): string[] {
  return (product.baseToppings || [])
    .filter((id) => id !== 'butter')
    .map((id) => {
      const label = optionLabel(id)
      return label === id ? titleCase(id) : label
    })
}

export interface ItemOptionsWizardProps {
  product: Product
  /** Editing a line already on the ticket (not yet sent). */
  initial?: CartLine
  onClose: () => void
  onConfirm: (line: Omit<CartLine, 'lineId'>) => void
}

export default function ItemOptionsWizard({ product, initial, onClose, onConfirm }: ItemOptionsWizardProps) {
  const extras = useMemo(() => extrasFor(product), [product])
  const sauces = useMemo(() => (product.sauces ? getSauces() : []), [product])
  const hasSalads = SALAD_ELIGIBLE_CATEGORIES.has(product.category)
  const leaveOffChoices = useMemo(() => {
    const names = [...baseToppingNames(product), ...(LEAVE_OFF[product.category] || [])]
    return names.filter((n, i) => names.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i)
  }, [product])
  const requestChoices = KITCHEN_REQUESTS[product.category] || []

  // Rebuild the choices from a line being edited.
  const initialMods = initial?.conversationalModifiers || []
  const initialButter: Butter = initialMods.some((m) => m.name === 'Butter' && m.type === 'no')
    ? 'none'
    : initialMods.some((m) => m.name === 'Garlic Butter')
    ? 'garlic'
    : initialMods.some((m) => m.name === 'Vegan Spread')
    ? 'vegan'
    : 'real'
  const initialNoteParts = (initial?.notes || '').split(',').map((s) => s.trim()).filter(Boolean)

  const [butter, setButter] = useState<Butter>(initialButter)
  const [leaveOff, setLeaveOff] = useState<string[]>(() =>
    initialMods.filter((m) => m.type === 'no' && m.name !== 'Butter').map((m) => m.name),
  )
  const [requests, setRequests] = useState<string[]>(() => initialNoteParts.filter((p) => requestChoices.includes(p)))
  const [note, setNote] = useState(() => initialNoteParts.filter((p) => !requestChoices.includes(p) && p !== '🔥 RUSH ORDER').join(', '))
  const [rush, setRush] = useState(Boolean(initial?.isRush))
  const [toppings, setToppings] = useState<string[]>(() => [...(initial?.extras || [])])
  const [chosenSalads, setChosenSalads] = useState<string[]>(() => [...(initial?.salads || [])])
  const [chosenSauces, setChosenSauces] = useState<string[]>(() => [...(initial?.sauces || [])])
  const [meal, setMeal] = useState(Boolean(initial?.meal))
  const [mealDrink, setMealDrink] = useState<string>(initial?.mealDrink || MEAL_DEAL.drinkOptions[0].id)
  const [mealSnack, setMealSnack] = useState<string>(initial?.mealSnack || MEAL_DEAL.snackOptions[0].id)
  const [qty, setQty] = useState(initial?.qty || 1)
  const [expressMode, setExpressMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(WIZARD_MODE_KEY) === 'express'
    } catch {
      return false
    }
  })

  const toggleExpressMode = (next: boolean) => {
    setExpressMode(next)
    try {
      localStorage.setItem(WIZARD_MODE_KEY, next ? 'express' : 'tabs')
    } catch {
      // ignore storage errors
    }
  }

  const steps = useMemo(() => {
    const list: { id: StepId; label: string }[] = [{ id: 'free', label: 'Complimentary' }]
    if (extras.length > 0) list.push({ id: 'toppings', label: product.category === 'SPUDS' ? 'Spud Toppings' : 'Extras' })
    if (hasSalads) list.push({ id: 'salads', label: 'Fresh Salad' })
    if (sauces.length > 0) list.push({ id: 'sauces', label: 'Sauces' })
    if (product.mealEligible) list.push({ id: 'meal', label: 'Make It A Meal' })
    return list
  }, [extras.length, hasSalads, sauces.length, product])
  // Opens on Complimentary like the EPOS till staff already know.
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[Math.min(stepIndex, steps.length - 1)]

  const extraPrice = (id: string) => extras.find((e) => e.id === id)?.price ?? 0
  const unitPrice = product.price + toppings.reduce((n, id) => n + extraPrice(id), 0) + (meal ? MEAL_DEAL.price : 0)
  const total = unitPrice * qty

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  const countOf = (id: string) => toppings.filter((t) => t === id).length
  const removeOne = (id: string) =>
    setToppings((prev) => {
      const i = prev.lastIndexOf(id)
      return i < 0 ? prev : [...prev.slice(0, i), ...prev.slice(i + 1)]
    })

  const confirm = () => {
    playPOSTouchTone('action')
    const mods: CartLineModifier[] = []
    if (product.category === 'SPUDS') {
      if (butter === 'none') mods.push({ name: 'Butter', type: 'no' })
      if (butter === 'garlic') mods.push({ name: 'Garlic Butter', type: 'regular' })
      if (butter === 'vegan') mods.push({ name: 'Vegan Spread', type: 'regular' })
    }
    leaveOff.forEach((name) => mods.push({ name, type: 'no' }))
    const notes = [rush ? '🔥 RUSH ORDER' : null, ...requests, note.trim() || null].filter(Boolean).join(', ')
    onConfirm({
      productId: product.id,
      name: product.name,
      base: product.price,
      extras: toppings,
      salads: chosenSalads.length > 0 ? chosenSalads : undefined,
      sauces: chosenSauces,
      meal,
      mealDrink: meal ? mealDrink : undefined,
      mealSnack: meal ? mealSnack : undefined,
      notes: notes || undefined,
      image: product.image,
      category: product.category,
      qty,
      conversationalModifiers: mods.length > 0 ? mods : undefined,
      station: stationFor(product.category),
      isRush: rush || undefined,
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA'
      if (e.key === 'Escape') onClose()
      else if (e.key === 'Enter' && !typing) {
        e.preventDefault()
        confirm()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const chip = (active: boolean, tone: 'amber' | 'rose' | 'emerald' = 'amber') =>
    `rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition active:scale-95 ${
      active
        ? tone === 'rose'
          ? 'border-rose-400 bg-rose-500 text-white'
          : tone === 'emerald'
          ? 'border-emerald-400 bg-emerald-500 text-ink'
          : 'border-amber-300 bg-amber-400 text-ink'
        : 'border-white/10 bg-white/5 text-white hover:bg-white/10'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={`${product.name} options`}>
      {/* One fixed size on tablets and up, so Next / Add never jump between tabs. */}
      <div className="flex w-full max-w-3xl max-h-[calc(100vh-1.5rem)] supports-[height:100dvh]:max-h-[calc(100dvh-1.5rem)] sm:h-[42rem] flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-900 text-white shadow-2xl font-body">
        {/* Header: item, base price, quantity */}
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 pt-4 pb-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">{initial ? 'Edit item' : 'Add item'}</p>
            <h3 className="display truncate text-xl font-black">{product.name}</h3>
            <p className="text-xs text-white/50">{gbp(product.price)} each</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-white/15 bg-white/5 p-0.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => toggleExpressMode(false)}
                className={`rounded-lg px-2.5 py-1.5 transition ${!expressMode ? 'bg-amber-400 text-ink font-black' : 'text-white/60 hover:text-white'}`}
                title="Stepped tab layout"
              >
                📑 Tabs
              </button>
              <button
                type="button"
                onClick={() => toggleExpressMode(true)}
                className={`rounded-lg px-2.5 py-1.5 transition ${expressMode ? 'bg-amber-400 text-ink font-black' : 'text-white/60 hover:text-white'}`}
                title="All modifiers on a single screen for fast counter entry"
              >
                ⚡ Express
              </button>
            </div>
            <div className="flex items-center gap-1.5" aria-label="Quantity">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-lg font-black hover:bg-white/15" aria-label="One fewer">
                −
              </button>
              <span className="w-8 text-center font-mono text-lg font-black">{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(50, q + 1))} className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-lg font-black hover:bg-white/15" aria-label="One more">
                +
              </button>
            </div>
          </div>
        </div>

        {/* Tabs (EPOS: Complimentary · Spud Toppings · Fresh Salad · Sauces · Make It A Meal) */}
        {!expressMode && (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-2 scrollbar-none" role="tablist">
            {steps.map((s, i) => {
              const active = s.id === step.id
              const badge =
                s.id === 'toppings'
                  ? toppings.length
                  : s.id === 'salads'
                  ? chosenSalads.length
                  : s.id === 'sauces'
                  ? chosenSauces.length
                  : s.id === 'meal'
                  ? meal
                    ? 1
                    : 0
                  : leaveOff.length + requests.length + (butter !== 'real' && product.category === 'SPUDS' ? 1 : 0)
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setStepIndex(i)}
                  className={`relative shrink-0 whitespace-nowrap px-3 py-3 text-xs font-bold tracking-wide transition sm:px-4 ${active ? 'text-amber-300' : 'text-white/60 hover:text-white'}`}
                >
                  {s.label}
                  {badge > 0 && <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 font-mono text-[10px] font-black text-ink">{badge}</span>}
                  {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-amber-400" />}
                </button>
              )
            })}
          </div>
        )}

        <div className="min-h-[14rem] flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {(expressMode || step.id === 'free') && (
            <div className="space-y-4">
              {expressMode && <p className="text-[11px] font-black uppercase tracking-wider text-amber-300">1. Complimentary &amp; Prep</p>}
              {product.category === 'SPUDS' && (
                <div>
                  <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-white/50">Butter</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {BUTTERS.map((b) => (
                      <button key={b.id} type="button" onClick={() => setButter(b.id)} className={chip(butter === b.id, b.id === 'none' ? 'rose' : 'amber')}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {leaveOffChoices.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-white/50">Leave off (free)</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {leaveOffChoices.map((name) => (
                      <button key={name} type="button" onClick={() => setLeaveOff((prev) => toggle(prev, name))} className={chip(leaveOff.includes(name), 'rose')}>
                        No {name.toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {requestChoices.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-white/50">Kitchen requests</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {requestChoices.map((r) => (
                      <button key={r} type="button" onClick={() => setRequests((prev) => toggle(prev, r))} className={chip(requests.includes(r), 'emerald')}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  type="text"
                  value={note}
                  maxLength={120}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note for the kitchen (allergy, request…)"
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-amber-400 focus:outline-none"
                />
                <button type="button" onClick={() => setRush((v) => !v)} className={chip(rush, 'rose') + ' text-center'}>
                  🔥 {rush ? 'Rush' : 'Rush?'}
                </button>
              </div>
            </div>
          )}

          {(expressMode ? extras.length > 0 : step.id === 'toppings') && (
            <div className="space-y-2">
              {expressMode && <p className="border-t border-white/10 pt-3 text-[11px] font-black uppercase tracking-wider text-amber-300">2. Paid Toppings &amp; Fillings</p>}
              <p className="text-[11px] text-white/50">Tap to add. Tap again for a double portion.</p>
              {/* Equal-height tiles; a picked topping shows its count and a − in its own column, never over the name. */}
              <div className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3">
                {extras.map((e) => {
                  const n = countOf(e.id)
                  return (
                    <div
                      key={e.id}
                      className={`flex min-h-[4.25rem] overflow-hidden rounded-xl border transition ${n > 0 ? 'border-amber-300 bg-amber-400 text-ink' : 'border-white/10 bg-white/5 text-white hover:bg-white/10'}`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          playPOSTouchTone('tap')
                          setToppings((prev) => [...prev, e.id])
                        }}
                        className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2.5 text-left active:scale-[0.97]"
                      >
                        <span className="line-clamp-2 text-sm font-black leading-tight">{e.label}</span>
                        <span className={`mt-0.5 font-mono text-xs ${n > 0 ? 'text-ink/70' : 'text-amber-300'}`}>+{gbp(e.price)}</span>
                      </button>
                      {n > 0 && (
                        <div className="flex w-12 shrink-0 flex-col items-center justify-center gap-1 border-l border-ink/15 bg-amber-300/60">
                          <span className="font-mono text-sm font-black leading-none" aria-label={`${n} portion${n === 1 ? '' : 's'}`}>
                            ×{n}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeOne(e.id)}
                            className="grid h-7 w-7 place-items-center rounded-full bg-ink text-base font-black leading-none text-white hover:bg-ink/80"
                            aria-label={`Remove one ${e.label}`}
                          >
                            −
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {(expressMode ? hasSalads : step.id === 'salads') && (
            <div className="space-y-2.5">
              <div className={expressMode ? 'border-t border-white/10 pt-3 flex flex-wrap items-center justify-between gap-2' : 'flex flex-wrap items-center justify-between gap-2'}>
                <p className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
                  🥗 Fresh Salad Selection (Free)
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setChosenSalads(FRESH_SALAD_OPTIONS.map((s) => s.id))}
                    className="rounded-lg bg-emerald-500 px-2.5 py-1 text-[11px] font-black text-ink hover:bg-emerald-400 transition"
                  >
                    All Salads 🥗
                  </button>
                  <button
                    type="button"
                    onClick={() => setChosenSalads([])}
                    className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/70 hover:bg-white/10 hover:text-white transition"
                  >
                    No Salad ✕
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FRESH_SALAD_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setChosenSalads((prev) => toggle(prev, s.id))}
                    className={chip(chosenSalads.includes(s.id), 'emerald')}
                  >
                    {chosenSalads.includes(s.id) ? `✓ ${s.label}` : s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(expressMode ? sauces.length > 0 : step.id === 'sauces') && (
            <div className="space-y-2">
              {expressMode && <p className="border-t border-white/10 pt-3 text-[11px] font-black uppercase tracking-wider text-amber-300">🥫 Complimentary Sauces</p>}
              <p className="text-[11px] text-white/50">Sauces are free.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {sauces.map((s) => (
                  <button key={s.id} type="button" onClick={() => setChosenSauces((prev) => toggle(prev, s.id))} className={chip(chosenSauces.includes(s.id))}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(expressMode ? product.mealEligible : step.id === 'meal') && (
            <div className="space-y-3">
              {expressMode && <p className="border-t border-white/10 pt-3 text-[11px] font-black uppercase tracking-wider text-amber-300">🥤 Meal Deal Upgrade</p>}
              <button
                type="button"
                onClick={() => setMeal((v) => !v)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition ${meal ? 'border-amber-300 bg-amber-400 text-ink' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              >
                <span>
                  <span className="block text-base font-black">Make It A Meal</span>
                  <span className={`block text-xs ${meal ? 'text-ink/70' : 'text-white/50'}`}>{MEAL_DEAL.detail}</span>
                </span>
                <span className="font-mono text-lg font-black">+{gbp(MEAL_DEAL.price)}</span>
              </button>
              {meal && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-white/50">Drink</p>
                    <div className="grid gap-1.5">
                      {MEAL_DEAL.drinkOptions.map((d) => (
                        <button key={d.id} type="button" onClick={() => setMealDrink(d.id)} className={chip(mealDrink === d.id)}>
                          {d.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-white/50">Crisps or chocolate</p>
                    <div className="grid gap-1.5">
                      {MEAL_DEAL.snackOptions.map((s) => (
                        <button key={s.id} type="button" onClick={() => setMealSnack(s.id)} className={chip(mealSnack === s.id)}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: Close · Previous · Next · Add — Add is always available */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/10 bg-slate-900 p-3 sm:p-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-rose-500/50 px-4 py-3 text-xs font-black uppercase tracking-wider text-rose-300 hover:bg-rose-500/10">
            Close
          </button>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {!expressMode && stepIndex > 0 && (
              <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} className="rounded-xl border border-white/20 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-white/10">
                Previous
              </button>
            )}
            {!expressMode && stepIndex < steps.length - 1 && (
              <button type="button" onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))} className="rounded-xl border border-sky-400/50 bg-sky-500/15 px-4 py-3 text-xs font-black uppercase tracking-wider text-sky-200 hover:bg-sky-500/25">
                Next
              </button>
            )}
            <button type="button" onClick={confirm} className="rounded-xl bg-emerald-500 px-5 py-3 text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-emerald-400">
              {initial ? 'Update' : 'Add'} {qty > 1 ? `${qty} ` : ''}• {gbp(total)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
