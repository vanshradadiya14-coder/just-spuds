import { useMemo, useState } from 'react'
import { getStoredOrders } from '../../services/orderStore'
import { gbp } from '../../utils/format'

export interface AttachedCustomer {
  name: string
  phone: string
  email?: string
  /** Completed orders on record. */
  visits: number
  lifetimeSpendPence: number
  lastOrderAt?: string
  lastItems?: string
}

interface CustomerLookupModalProps {
  onClose: () => void
  onAttach: (customer: AttachedCustomer) => void
}

const PLACEHOLDER_PHONES = new Set(['01296 423456'])

/** Everyone who has ordered before, keyed by phone, newest order first. */
function buildDirectory(): AttachedCustomer[] {
  const byPhone = new Map<string, AttachedCustomer>()
  for (const o of getStoredOrders()) {
    const phone = (o.customer.phone || '').replace(/\s+/g, ' ').trim()
    if (!phone || PLACEHOLDER_PHONES.has(phone) || o.status === 'cancelled') continue
    const existing = byPhone.get(phone)
    const isNewer = !existing?.lastOrderAt || new Date(o.createdAt) > new Date(existing.lastOrderAt)
    byPhone.set(phone, {
      name: isNewer || !existing ? o.customer.name : existing.name,
      phone,
      email: existing?.email || (o.customer.email?.endsWith('@justspuds.uk') ? undefined : o.customer.email),
      visits: (existing?.visits ?? 0) + 1,
      lifetimeSpendPence: (existing?.lifetimeSpendPence ?? 0) + o.payment.total,
      lastOrderAt: isNewer ? o.createdAt : existing?.lastOrderAt,
      lastItems: isNewer ? o.lines.map((l) => `${l.qty}x ${l.name}`).join(', ') : existing?.lastItems,
    })
  }
  return [...byPhone.values()].sort((a, b) => (b.lastOrderAt || '').localeCompare(a.lastOrderAt || ''))
}

export default function CustomerLookupModal({ onClose, onAttach }: CustomerLookupModalProps) {
  const [query, setQuery] = useState('')
  const [newName, setNewName] = useState('')
  const directory = useMemo(buildDirectory, [])

  const q = query.trim().toLowerCase()
  const digits = q.replace(/\D/g, '')
  const matches = q
    ? directory.filter((c) => c.name.toLowerCase().includes(q) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits))).slice(0, 8)
    : directory.slice(0, 6)

  const canCreate = digits.length >= 10 && newName.trim().length > 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl border border-white/20 bg-slate-900 p-5 shadow-2xl space-y-3 text-white font-body">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="font-bold text-sm text-white">👤 Attach Customer</h3>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white" aria-label="Close customer lookup">
            ✕
          </button>
        </div>

        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Phone number or name…"
          className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-amber-400 focus:outline-none"
        />

        <ul className="space-y-1.5 max-h-72 overflow-y-auto">
          {matches.length === 0 && (
            <li className="rounded-xl border border-dashed border-white/10 p-4 text-center text-[11px] text-white/40">
              {q ? 'No customer on record with that phone or name.' : 'No customers on record yet.'}
            </li>
          )}
          {matches.map((c) => (
            <li key={c.phone}>
              <button
                type="button"
                onClick={() => onAttach(c)}
                className="w-full rounded-xl border border-white/10 bg-black/40 p-3 text-left hover:border-amber-400 hover:bg-amber-400/10 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white">{c.name}</span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    {c.visits} {c.visits === 1 ? 'visit' : 'visits'} &bull; {gbp(c.lifetimeSpendPence)}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-white/60">{c.phone}</p>
                {c.lastItems && <p className="mt-0.5 text-[10px] text-white/40 line-clamp-1">Last: {c.lastItems}</p>}
              </button>
            </li>
          ))}
        </ul>

        {digits.length >= 10 && matches.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
            <p className="text-[11px] text-white/60">New customer for <span className="font-mono text-white">{query.trim()}</span></p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Customer name"
                className="flex-1 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                disabled={!canCreate}
                onClick={() => onAttach({ name: newName.trim(), phone: query.trim(), visits: 0, lifetimeSpendPence: 0 })}
                className="rounded-lg bg-amber-400 px-3 text-xs font-black text-ink hover:bg-amber-300 disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
