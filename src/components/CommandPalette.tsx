import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getOnlineProducts } from '../services/menuStore'
import { type Product } from '../data/menu'
import { gbp } from '../utils/format'
import SmartImage from './SmartImage'

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  /** Required for the Ctrl/⌘+K shortcut — open state is owned by the parent. */
  onOpen: () => void
}

export default function CommandPalette({ isOpen, onClose, onOpen }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<Product[]>(() => getOnlineProducts())
  const navigate = useNavigate()

  useEffect(() => {
    if (isOpen) {
      setProducts(getOnlineProducts())
      setQuery('')
    }
  }, [isOpen])

  // Keyboard shortcut listener (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (isOpen) {
          onClose()
        } else {
          // The open branch used to be an empty TODO, so the shortcut did nothing
          // at all — despite the navbar and this panel both advertising ⌘K.
          setProducts(getOnlineProducts())
          onOpen()
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, onOpen])

  // Filtered menu items & quick actions
  const filteredProducts = useMemo(() => {
    if (!query.trim()) return products.slice(0, 6)
    const q = query.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    )
  }, [products, query])

  // Customer-facing destinations only. The staff KDS and admin console used to be
  // listed here, so a shopper typing "admin" into the menu search was handed a link
  // straight into the management portal.
  const quickLinks = [
    { label: '🥔 Custom Potato Builder', path: '/build', desc: 'Build your meal from scratch with custom toppings' },
    { label: '📍 Find Us & Opening Hours', path: '/find-us', desc: 'Market Square, Aylesbury (11am – 10pm)' },
    { label: '🛵 Track Live Order', path: '/track', desc: 'Track your food in real-time on the map' },
    { label: '📖 The Story of Just Spuds', path: '/story', desc: '800-year British heritage & King Edward potatoes' },
  ]

  const filteredQuickLinks = useMemo(() => {
    if (!query.trim()) return quickLinks
    const q = query.toLowerCase()
    return quickLinks.filter((l) => l.label.toLowerCase().includes(q) || l.desc.toLowerCase().includes(q))
  }, [query])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 sm:p-6 md:p-20 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
        />

        {/* Command Modal Box */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: -20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: -20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl border border-white/20 bg-slate-900/95 shadow-2xl backdrop-blur-xl text-white"
        >
          {/* Top Search Input Bar */}
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
            <span className="text-xl text-amber-400">🔍</span>
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dishes, toppings, opening times, order tracker..."
              className="flex-1 bg-transparent font-body text-base text-white placeholder:text-white/40 focus:outline-none"
            />
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-xs text-white/60 hover:bg-white/10 hover:text-white"
            >
              ESC
            </button>
          </div>

          {/* Results List */}
          <div className="max-h-[60vh] overflow-y-auto p-4 space-y-5">
            {/* Menu Items */}
            {filteredProducts.length > 0 && (
              <div>
                <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  🍽️ Menu Items ({filteredProducts.length})
                </span>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      onClick={() => {
                        onClose()
                        // Route is `menu/:id` (see App.tsx). This previously pointed at
                        // `/product/:id`, which matches no route, so every search
                        // result landed on the 404 page.
                        navigate(`/menu/${product.id}`)
                      }}
                      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2.5 hover:border-amber-400/50 hover:bg-white/10 cursor-pointer transition"
                    >
                      <div className="h-12 w-12 rounded-xl overflow-hidden bg-black/40 shrink-0">
                        <SmartImage src={product.image} alt={product.name} className="h-full w-full" cover />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-body text-xs font-bold text-white truncate group-hover:text-amber-300">
                          {product.name}
                        </p>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[10px] text-white/50">{product.category}</span>
                          <span className="font-mono text-xs font-bold text-amber-400">{gbp(product.price)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions & Navigation */}
            {filteredQuickLinks.length > 0 && (
              <div>
                <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                  ⚡ Quick Navigation &amp; Tools
                </span>
                <div className="mt-2 space-y-1.5">
                  {filteredQuickLinks.map((link) => (
                    <div
                      key={link.path}
                      onClick={() => {
                        onClose()
                        navigate(link.path)
                      }}
                      className="flex items-center justify-between rounded-xl p-2.5 hover:bg-white/10 cursor-pointer transition group"
                    >
                      <div>
                        <p className="font-body text-xs font-bold text-white group-hover:text-amber-300">
                          {link.label}
                        </p>
                        <p className="text-[11px] text-white/50">{link.desc}</p>
                      </div>
                      <span className="text-xs text-white/40 group-hover:text-white transition">→</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filteredProducts.length === 0 && filteredQuickLinks.length === 0 && (
              <div className="py-10 text-center text-white/50 space-y-2">
                <span className="text-4xl">🥔</span>
                <p className="text-sm">No items found matching "{query}"</p>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate('/menu')
                  }}
                  className="rounded-full bg-amber-400 px-4 py-1.5 text-xs font-bold text-ink hover:bg-amber-300"
                >
                  Browse Full Menu
                </button>
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="border-t border-white/10 bg-white/[0.02] px-5 py-3 flex items-center justify-between text-[11px] text-white/40">
            <span>
              Tip: Press <kbd className="rounded bg-white/10 px-1 py-0.5 font-mono text-white/80">Ctrl + K</kbd> anywhere to search
            </span>
            <span className="text-amber-400 font-bold">Just Spuds Aylesbury</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
