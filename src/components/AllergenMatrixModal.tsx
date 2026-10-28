import { useState, useMemo } from 'react'
import { getOnlineProducts } from '../services/menuStore'
import { SPUD_EXTRAS } from '../data/menu'
import { gbp } from '../utils/format'
import { UK_14_ALLERGENS, hasAllergenInfo, isSafeFor, listedAllergens, type AllergenId } from '../utils/allergens'

export interface AllergenMatrixModalProps {
  isOpen: boolean
  onClose: () => void
}

export { UK_14_ALLERGENS }

export default function AllergenMatrixModal({ isOpen, onClose }: AllergenMatrixModalProps) {
  const [selectedAllergens, setSelectedAllergens] = useState<AllergenId[]>([])
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'veg' | 'gf' | 'halal'>('all')
  const [activeTab, setActiveTab] = useState<'matrix' | 'disclaimer'>('matrix')

  const products = useMemo(() => getOnlineProducts(), [])

  if (!isOpen) return null

  const toggleAllergen = (id: AllergenId) => {
    setSelectedAllergens((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    )
  }

  const clearFilters = () => {
    setSelectedAllergens([])
    setDietaryFilter('all')
  }

  // Filter products by selected allergen exclusions & dietary requirements
  const filteredProducts = products.filter((p) => {
    if (dietaryFilter === 'veg' && !p.vegetarian) return false
    if (dietaryFilter === 'gf' && !p.glutenFree) return false
    if (dietaryFilter === 'halal' && !p.halalFriendly) return false

    // All 14 allergens; items with no allergen information are never shown as safe.
    return isSafeFor(p, selectedAllergens)
  })

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto p-4 bg-ink/80 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Allergen & Nutritional Information"
    >
      <div className="relative w-full max-w-4xl overflow-hidden rounded-3xl bg-white text-ink shadow-2xl border border-amber-500/20 my-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/10 bg-amber-50/70 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-400 text-xl shadow-glow">
              🛡️
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="display text-xl font-bold text-ink">
                  Natasha&rsquo;s Law &amp; Allergen Matrix
                </h3>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-body text-[10px] font-black uppercase text-emerald-800">
                  UK 14 Certified
                </span>
              </div>
              <p className="font-body text-xs text-slate-600">
                Full transparency for all 14 statutory UK food allergens &amp; dietary options
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-ink/5 hover:text-ink transition"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-ink/10 px-6 bg-paper/40">
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`py-3 px-4 font-body text-xs font-bold border-b-2 transition-all ${
              activeTab === 'matrix'
                ? 'border-amber-500 text-ink font-black'
                : 'border-transparent text-slate-500 hover:text-ink'
            }`}
          >
            🔍 Interactive Allergen Filter &amp; Menu Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('disclaimer')}
            className={`py-3 px-4 font-body text-xs font-bold border-b-2 transition-all ${
              activeTab === 'disclaimer'
                ? 'border-amber-500 text-ink font-black'
                : 'border-transparent text-slate-500 hover:text-ink'
            }`}
          >
            📋 Kitchen Protocols &amp; Natasha&rsquo;s Law Policy
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'matrix' ? (
            <>
              {/* Filter Controls */}
              <div className="rounded-2xl border border-amber-300/60 bg-amber-50/50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-body text-xs font-black uppercase tracking-wider text-amber-900">
                    Step 1: Select Allergens to Exclude:
                  </span>
                  {(selectedAllergens.length > 0 || dietaryFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="font-body text-[11px] font-bold text-amber-800 underline hover:text-amber-950"
                    >
                      Clear All Filters ({selectedAllergens.length} active)
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {UK_14_ALLERGENS.map((all) => {
                    const isSelected = selectedAllergens.includes(all.id)
                    return (
                      <button
                        key={all.id}
                        type="button"
                        onClick={() => toggleAllergen(all.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-body text-[11px] font-bold transition-all ${
                          isSelected
                            ? 'bg-rose-500 text-white shadow-sm ring-2 ring-rose-300'
                            : 'bg-white border border-slate-200 text-slate-700 hover:border-amber-400'
                        }`}
                      >
                        <span>{all.icon}</span>
                        <span>{all.name}</span>
                        {isSelected && <span>✕</span>}
                      </button>
                    )
                  })}
                </div>

                {/* Dietary Preference Filter */}
                <div className="pt-2 border-t border-amber-200/60 flex flex-wrap items-center gap-2">
                  <span className="font-body text-[11px] font-bold text-slate-600">Dietary:</span>
                  {(['all', 'veg', 'gf', 'halal'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDietaryFilter(mode)}
                      className={`rounded-full px-3 py-0.5 font-body text-[10px] font-bold uppercase tracking-wider transition ${
                        dietaryFilter === mode
                          ? 'bg-ink text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {mode === 'all' && 'All Dietaries'}
                      {mode === 'veg' && '🌿 Vegetarian Only'}
                      {mode === 'gf' && '🌾 Gluten-Free Only'}
                      {mode === 'halal' && '🍗 Halal-Friendly Only'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status summary */}
              <div className="flex items-center justify-between text-xs font-body text-slate-600">
                <span>
                  Showing <strong className="text-ink font-bold">{filteredProducts.length}</strong> safe items for your selected filters
                </span>
                {selectedAllergens.length > 0 && (
                  <span className="text-emerald-700 font-bold">
                    ✓ Filter active: Items containing {selectedAllergens.join(', ')} are hidden
                  </span>
                )}
              </div>

              {/* Product Allergen Table */}
              <div className="overflow-x-auto rounded-2xl border border-ink/10 shadow-xs">
                <table className="w-full text-left font-body text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-ink/10">
                      <th className="py-3 px-4">Menu Item</th>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3">Price</th>
                      <th className="py-3 px-3">Calories</th>
                      <th className="py-3 px-4">Contains Allergens</th>
                      <th className="py-3 px-3">Dietary Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {filteredProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-amber-50/40 transition">
                        <td className="py-3 px-4 font-bold text-ink">
                          {p.name}
                        </td>
                        <td className="py-3 px-3 text-slate-500 font-medium capitalize">
                          {p.category.toLowerCase().replace('_', ' ')}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-700">
                          {gbp(p.price)}
                        </td>
                        <td className="py-3 px-3 text-slate-500">
                          {p.calories ? `${p.calories} kcal` : '—'}
                        </td>
                        <td className="py-3 px-4">
                          {listedAllergens(p).length > 0 || (!p.glutenFree && !listedAllergens(p).some((a) => /gluten|wheat/i.test(a))) ? (
                            <div className="flex flex-wrap gap-1">
                              {listedAllergens(p).map((alg, i) => (
                                <span
                                  key={i}
                                  className="rounded bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800"
                                >
                                  {alg}
                                </span>
                              ))}
                              {!p.glutenFree && !listedAllergens(p).some((a) => /gluten|wheat/i.test(a)) && (
                                <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                  Not gluten-free
                                </span>
                              )}
                            </div>
                          ) : hasAllergenInfo(p) ? (
                            <span className="text-emerald-700 font-bold text-[11px]">None of the 14 listed</span>
                          ) : (
                            <span className="text-amber-700 font-bold text-[11px]">Ask staff before ordering</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {p.vegetarian && (
                              <span className="rounded bg-emerald-50 text-emerald-800 px-1.5 py-0.5 text-[9px] font-bold">
                                🌿 Veg
                              </span>
                            )}
                            {p.glutenFree && (
                              <span className="rounded bg-amber-50 text-amber-800 px-1.5 py-0.5 text-[9px] font-bold">
                                🌾 GF
                              </span>
                            )}
                            {p.halalFriendly && (
                              <span className="rounded bg-purple-50 text-purple-800 px-1.5 py-0.5 text-[9px] font-bold">
                                Halal
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Toppings / Extras Matrix */}
              <div className="rounded-2xl border border-ink/10 p-4 bg-paper/60 space-y-2">
                <h4 className="font-body text-xs font-black uppercase tracking-wider text-ink">
                  🥔 Spud Toppings &amp; Extra Fillings Allergen Matrix:
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-2">
                  {SPUD_EXTRAS.map((ex) => (
                    <div key={ex.id} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs text-xs">
                      <div className="flex justify-between font-bold text-ink">
                        <span>{ex.label}</span>
                        <span className="text-amber-700">{gbp(ex.price)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{ex.dietary || 'Standard'}</span>
                        <span className={ex.allergen === 'None' ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                          {ex.allergen || 'None'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Kitchen Protocols & Natasha's Law Policy */
            <div className="space-y-5 text-sm font-body text-slate-700 leading-relaxed">
              <div className="rounded-2xl border border-amber-400/40 bg-amber-50/60 p-5">
                <h4 className="font-bold text-base text-ink mb-2">
                  📜 Natasha&rsquo;s Law (Food Information Amendment) Commitment
                </h4>
                <p>
                  At Just Spuds Aylesbury, customer safety is paramount. All foods pre-packed for direct sale (PPDS)
                  and fresh items built to order carry clear, full ingredient lists with statutory allergens emphasized in bold.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-ink/10 p-4 bg-white shadow-sm space-y-2">
                  <h5 className="font-bold text-ink">🧑‍🍳 Kitchen Cross-Contamination Protocol</h5>
                  <p className="text-xs text-slate-600">
                    While our team adheres to strict sanitization, separate utensil usage, and allergen color-coded prep stations,
                    our kitchen handles Dairy, Gluten, Mustard, Eggs, Fish and Celery. We cannot 100% guarantee an allergen-free environment
                    for severe airborne or contact anaphylaxis.
                  </p>
                </div>
                <div className="rounded-2xl border border-ink/10 p-4 bg-white shadow-sm space-y-2">
                  <h5 className="font-bold text-ink">🌾 Gluten &amp; Celiac Safety</h5>
                  <p className="text-xs text-slate-600">
                    Our King Edward jacket potatoes are naturally 100% gluten-free. We use separate tongs for potato splitting
                    and can apply cheese, Heinz baked beans, and butter directly with dedicated utensils upon request.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-ink text-white p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h5 className="font-bold text-base text-amber-300">Need specific dietary accommodation?</h5>
                  <p className="text-xs text-white/80 mt-1">
                    Speak directly with our Duty Kitchen Manager before placing your order:
                  </p>
                </div>
                <a
                  href="tel:+441296423456"
                  className="rounded-full bg-amber-400 px-5 py-2.5 font-body text-xs font-bold text-ink hover:bg-amber-300 transition shrink-0"
                >
                  📞 Call Store: 01296 423456
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-ink/10 bg-slate-50 px-6 py-3.5">
          <p className="font-body text-[11px] text-slate-500">
            Complies with UK Food Standards Agency (FSA) &amp; Regulation (EU) No 1169/2011.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-ink px-6 py-2 font-body text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800 transition"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  )
}
