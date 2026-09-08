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
    <div className="bg-stock px-5 pb-40 pt-[180px] text-center">
      <span className="label text-steel">404</span>
      <p className="mt-4 display display-tight text-5xl text-ink sm:text-7xl">
        Nothing <span className="italic text-steel">here</span>
      </p>
      <p className="mx-auto mt-5 max-w-sm font-body text-[14px] leading-relaxed text-steel">
        That page doesn&rsquo;t exist. The food does, though.
      </p>
      <Link to="/menu" className="mt-8 inline-block rounded-full bg-ink px-8 py-4 font-body text-[12px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-slate-600">
        See the menu
      </Link>
    </div>
  )
}
