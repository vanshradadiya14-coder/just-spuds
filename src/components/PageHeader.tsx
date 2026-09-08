import Reveal from './Reveal'
import Backdrop, { GhostType } from './Backdrop'

export default function PageHeader({
  eyebrow, title, titleItalic, blurb, ghost, compactMobile = false,
}: { eyebrow: string; title: string; titleItalic?: string; blurb?: string; ghost?: string; compactMobile?: boolean }) {
  return (
    <header className={compactMobile ? "on-dark relative overflow-hidden bg-ink-stock pb-4 pt-24 sm:pb-16 sm:pt-[140px]" : "on-dark relative overflow-hidden bg-ink-stock pb-6 pt-24 sm:pb-20 sm:pt-[150px]"}>
      <Backdrop tone="dark" spotlight intensity={1.05} />
      {ghost && (
        <GhostType className="hidden sm:block -right-[5%] bottom-[-18%] text-[30vw]">{ghost}</GhostType>
      )}
      <div className="relative mx-auto max-w-[1400px] px-4 sm:px-8">
        <Reveal>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-0.5 font-body text-[10px] font-bold uppercase tracking-wider text-amber-300 sm:text-xs">
            {eyebrow}
          </span>
          <h1 className="mt-2 sm:mt-4 display display-tight text-2xl sm:text-[72px] lg:text-[96px] text-white">
            {title}
            {titleItalic && <span className="block italic text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500">{titleItalic}</span>}
          </h1>
          {blurb && (
            <p className="hidden sm:block mt-4 max-w-xl font-body text-[14px] leading-relaxed text-white/60">{blurb}</p>
          )}
        </Reveal>
      </div>
    </header>
  )
}
