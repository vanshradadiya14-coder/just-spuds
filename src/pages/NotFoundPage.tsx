import { Link } from 'react-router-dom'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

export default function NotFoundPage() {
  // Without this the 404 inherited whichever title the previous page had set,
  // so a mistyped URL still read "Full Menu — Jacket Potatoes…" in the tab.
  useDocumentMeta({
    title: 'Page Not Found',
    description: 'That page doesn’t exist. Browse the Just Spuds Aylesbury menu instead.',
  })

  return (
    <div className="relative min-h-[85vh] bg-stock px-5 pb-40 pt-[160px] sm:pt-[190px] flex items-center justify-center text-center overflow-hidden">
      {/* Radiant Ambient Core Halo */}
      <div className="pointer-events-none absolute h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-amber-400/25 via-amber-200/15 to-orange-400/10 blur-[130px]" />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-amber-400/35 bg-white/90 backdrop-blur-xl p-8 sm:p-10 shadow-warm-lg ring-1 ring-amber-400/20">
        <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-3xl bg-amber-400/20 border border-amber-400/40 text-4xl shadow-glow text-amber-500 animate-bounce">
          🥔
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-0.5 font-mono text-xs font-black uppercase tracking-wider text-amber-900">
          Error 404 &bull; Missing Spud
        </span>
        <h1 className="mt-4 display display-tight text-4xl sm:text-5xl text-ink font-bold">
          Nothing <span className="italic text-amber-600">here</span>
        </h1>
        <p className="mx-auto mt-3 max-w-sm font-body text-sm leading-relaxed text-slate-600">
          That page doesn&rsquo;t exist. The piping hot British jacket potatoes do, though!
        </p>
        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/menu"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 px-7 py-3.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-warm hover:bg-amber-300 transition active:scale-95"
          >
            <span>🥔</span>
            <span>Browse Menu</span>
          </Link>
          <Link
            to="/"
            className="w-full sm:w-auto rounded-full border border-ink/15 bg-white/80 px-6 py-3.5 font-body text-xs font-bold uppercase tracking-wider text-ink hover:bg-paper transition"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  )
}
