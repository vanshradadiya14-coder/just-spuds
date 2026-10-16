import { useEffect, useMemo, useState } from 'react'
import { adjustProductStock, getCategories, getProducts, isListedInStore, isProductSoldOut, subscribeMenu } from '../../services/menuStore'
import { getMenuStockOverrides, subscribeStock, toggleItemStock } from '../../services/orderStore'
import type { Product } from '../../data/menu'

/**
 * EPOS "Stock": what is left of each item, and the 86 switch (sold out now).
 * The 86 switch is the same one the kitchen screen uses, so it reaches the
 * website and every till at once. Changing a count needs a manager PIN.
 */
export default function StockModal({
  onClose,
  actor,
  requireManagerAuth,
}: {
  onClose: () => void
  actor: string
  requireManagerAuth: (title: string, description: string, onApproved: (managerName: string) => void) => void
}) {
  const [products, setProducts] = useState<Product[]>(() => getProducts())
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => getMenuStockOverrides())
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)

  useEffect(() => subscribeMenu(() => setProducts(getProducts())), [])
  useEffect(() => subscribeStock(setOverrides), [])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = products.filter(isListedInStore).filter((p) => !q || p.name.toLowerCase().includes(q))
    return getCategories()
      .map((c) => ({ category: c, items: list.filter((p) => p.category === c.id) }))
      .filter((g) => g.items.length > 0)
  }, [products, query])

  const saveCount = () => {
    if (!editing) return
    const qty = Math.max(0, Math.round(Number(editing.value)))
    const product = products.find((p) => p.id === editing.id)
    if (!product || !Number.isFinite(qty)) return
    requireManagerAuth('Stock count', `${product.name}: ${product.stockQuantity ?? 0} → ${qty}`, (mgr) => {
      adjustProductStock(product.id, qty, mgr || actor, 'Till stock count')
      setEditing(null)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center [align-items:safe_center] justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Stock">
      <div className="flex w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-3xl border border-white/15 bg-slate-900 text-white shadow-2xl font-body">
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 p-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-black">Stock</h3>
            <p className="text-[11px] text-white/55">“Sold out” takes an item off the till and the website straight away.</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/60 hover:text-white" aria-label="Close stock">
            ✕
          </button>
        </div>
        <div className="shrink-0 px-4 pt-3">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an item" className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:border-amber-400 focus:outline-none" />
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
          {groups.map(({ category, items }) => (
            <div key={category.id}>
              <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-amber-300">{category.label}</p>
              <ul className="space-y-1.5">
                {items.map((p) => {
                  const soldOut = isProductSoldOut(p, overrides)
                  const low = !soldOut && typeof p.stockQuantity === 'number' && p.stockQuantity <= (p.lowStockThreshold ?? 5)
                  const isEditing = editing?.id === p.id
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{p.name}</span>
                      {isEditing ? (
                        <span className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            autoFocus
                            value={editing.value}
                            onChange={(e) => setEditing({ id: p.id, value: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && saveCount()}
                            className="w-20 rounded-lg border border-white/15 bg-black/60 px-2 py-1.5 text-right font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
                            aria-label={`New count for ${p.name}`}
                          />
                          <button type="button" onClick={saveCount} className="rounded-lg bg-amber-400 px-2.5 py-1.5 text-[11px] font-black text-ink">
                            Save
                          </button>
                          <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-2 py-1.5 text-[11px] text-white/60">
                            ✕
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditing({ id: p.id, value: String(p.stockQuantity ?? 0) })}
                          className={`rounded-lg border px-2.5 py-1.5 font-mono text-xs font-bold ${low ? 'border-amber-400/50 text-amber-300' : 'border-white/15 text-white/70'} hover:bg-white/10`}
                          title="Change the count (manager PIN)"
                        >
                          {p.stockQuantity ?? 0} left
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleItemStock(p.id, soldOut)}
                        className={`w-28 rounded-lg py-1.5 text-[11px] font-black uppercase transition ${soldOut ? 'bg-rose-500 text-white' : 'bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'}`}
                        aria-pressed={soldOut}
                      >
                        {soldOut ? 'Sold out' : 'On sale'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
