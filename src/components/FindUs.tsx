import { useState } from 'react'
import { Link } from 'react-router-dom'
import Reveal from './Reveal'
import { SITE, MAPS_SEARCH_URL, APPLE_MAPS_URL } from '../data/site'
import { useCart } from '../hooks/useCart'

export default function FindUs({ embedded = false }: { embedded?: boolean } = {}) {
  const { open, count } = useCart()
  const [copied, setCopied] = useState(false)

  const copyAddress = () => {
    const fullAddr = `${SITE.name}, ${SITE.address.line1}, ${SITE.address.line2}, ${SITE.address.town} ${SITE.address.postcode}`
    navigator.clipboard.writeText(fullAddr)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <section id="find" className={`bg-stock ${embedded ? "pb-20 pt-10" : "pb-24 pt-8 sm:pb-32"}`}>
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        
        {/* Live Kitchen Baking Freshness Band */}
        <div className="mb-10 rounded-3xl border border-amber-400/40 bg-gradient-to-r from-ink via-slate-900 to-ink p-6 sm:p-8 text-white shadow-xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/20 text-2xl">
                🔥
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-body text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    Live Kitchen Status: {SITE.kitchen.statusText}
                  </span>
                </div>
                <p className="display text-xl sm:text-2xl text-white font-bold mt-0.5">
                  Batch {SITE.kitchen.currentBatch}
                </p>
                <p className="font-body text-[12px] text-white/70">
                  {SITE.kitchen.freshnessGuarantee}
                </p>
              </div>
            </div>

            <Link
              to="/menu"
              className="rounded-full bg-amber-400 px-6 py-3 font-body text-[11px] font-bold uppercase tracking-wider text-ink shadow-glow transition hover:bg-amber-300 hover:scale-105"
            >
              Order from this Batch →
            </Link>
          </div>
        </div>

        <div className={`grid gap-10 lg:grid-cols-12 lg:gap-12 ${embedded ? "" : "border-t border-ink/12 pt-14"}`}>
          {!embedded && (
            <Reveal className="lg:col-span-12">
              <span className="label text-amber-700 font-bold">Visit Us</span>
              <h2 className="mt-2 display text-4xl text-ink sm:text-5xl">
                Right in the heart of <span className="italic text-amber-600">Market Square</span>
              </h2>
            </Reveal>
          )}

          {/* Location & Navigation Card */}
          <Reveal delay={1} className="lg:col-span-4">
            <div className="rounded-3xl border border-ink/10 bg-white p-7 shadow-sm flex flex-col justify-between h-full">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 font-body text-[10px] font-bold uppercase text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Open Everyday &bull; 11am – 10pm</span>
                </div>

                <address className="mt-4 not-italic font-body text-[16px] leading-relaxed text-ink font-bold">
                  {SITE.name}<br />
                  {SITE.address.line1}<br />
                  {SITE.address.line2}<br />
                  {SITE.address.town} {SITE.address.postcode}
                </address>

                <p className="mt-3 font-body text-[12px] text-slate-600">
                  Located right by Brook House on the cobblestone square, opposite the historic clock tower.
                </p>
              </div>

              <div className="mt-6 space-y-2.5">
                <div className="flex flex-wrap gap-2">
                  <a
                    href={MAPS_SEARCH_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-4 py-2.5 font-body text-[11px] font-bold uppercase tracking-wider text-white transition hover:bg-slate-700 shadow-sm"
                  >
                    <span>📍</span>
                    <span>Google Maps</span>
                  </a>
                  <a
                    href={APPLE_MAPS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2.5 font-body text-[11px] font-bold uppercase tracking-wider text-ink transition hover:bg-paper"
                  >
                    <span>🗺️</span>
                    <span>Apple Maps</span>
                  </a>
                </div>

                <button
                  type="button"
                  onClick={copyAddress}
                  className="w-full rounded-full border border-ink/10 bg-paper/60 py-2 font-body text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:text-ink transition"
                >
                  {copied ? '✓ Full Address Copied!' : '📋 Copy Address for Sat-Nav'}
                </button>
              </div>
            </div>
          </Reveal>

          {/* Market Square Transit & Walking Guide */}
          <Reveal delay={2} className="lg:col-span-4">
            <div className="rounded-3xl border border-ink/10 bg-white p-7 shadow-sm flex flex-col justify-between h-full">
              <div>
                <p className="font-body text-[11px] font-bold uppercase tracking-wider text-steel">
                  Getting Here
                </p>
                <h3 className="mt-1 display text-2xl text-ink">Walking &amp; Parking</h3>

                <ul className="mt-4 divide-y divide-ink/8 font-body text-[13px]">
                  {SITE.transit.map((t) => (
                    <li key={t.from} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2">
                        <span>{t.icon}</span>
                        <span className="text-slate-700 font-medium text-xs">{t.from}</span>
                      </div>
                      <span className="font-bold text-amber-700 text-xs shrink-0">{t.time}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 rounded-2xl bg-paper p-3 text-[11px] font-body text-slate-600">
                💡 <strong>Tip:</strong> Outdoor bench seating available right outside on Market Square.
              </div>
            </div>
          </Reveal>

          {/* Order Ahead & Delivery Box */}
          <Reveal delay={3} className="lg:col-span-4">
            <div className="rounded-3xl border border-amber-400/40 bg-gradient-to-br from-white via-amber-50/40 to-amber-100/30 p-7 shadow-warm flex flex-col justify-between h-full">
              <div>
                <span className="rounded-full bg-amber-500 px-3 py-0.5 font-body text-[9px] font-black uppercase text-ink">
                  Zero Waiting Time
                </span>
                <p className="mt-2 display text-2xl uppercase leading-none text-ink">Click &amp; Collect</p>
                <p className="mt-2.5 font-body text-[13px] leading-relaxed text-slate-700">
                  Customise your potato online, pick your pickup time, and have it handed to you steaming hot.
                </p>
              </div>

              <div className="mt-6 space-y-3">
                {count > 0 ? (
                  <button
                    type="button"
                    onClick={open}
                    className="w-full rounded-full bg-amber-400 py-3.5 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-all hover:bg-amber-300 shadow-glow"
                  >
                    Review Order ({count}) &bull; Collect
                  </button>
                ) : (
                  <Link
                    to="/menu"
                    className="block w-full rounded-full bg-ink py-3.5 text-center font-body text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-slate-700 shadow-sm"
                  >
                    Start Fresh Order →
                  </Link>
                )}

                <div className="border-t border-amber-300/40 pt-3">
                  <p className="font-body text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5 text-center">
                    Prefer Delivery to Your Door?
                  </p>
                  <div className="flex items-center gap-1.5">
                    {SITE.deliveryPartners.map((partner) => (
                      <a
                        key={partner.name}
                        href={partner.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 rounded-xl border border-ink/10 bg-white py-1.5 text-center font-body text-[10px] font-bold text-ink hover:bg-amber-50 shadow-xs transition"
                      >
                        {partner.name}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
