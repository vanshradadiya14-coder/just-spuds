import { cx } from '../utils/format'

export function Wordmark({
  className, size = 'md', stacked = false, showTown = true, tone = 'light',
}: {
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  stacked?: boolean
  showTown?: boolean
  tone?: 'light' | 'dark'
}) {
  const sizes = {
    xs: 'text-[16px] leading-[0.86]',
    sm: 'text-[23px] leading-[0.85]',
    md: 'text-[36px] leading-[0.84] sm:text-[44px]',
    lg: 'text-[54px] leading-[0.82] sm:text-[76px]',
    xl: 'text-[58px] leading-[0.8] sm:text-[94px] lg:text-[118px]',
  }[size]
  const town = { xs: 'text-[6px]', sm: 'text-[7px]', md: 'text-[8px]', lg: 'text-[10px]', xl: 'text-[10px] sm:text-[13px]' }[size]
  const strong = tone === 'light' ? 'text-white' : 'text-ink'
  const soft = tone === 'light' ? 'text-white/55' : 'text-steel'

  return (
    <div className={cx('flex flex-col', stacked ? 'items-center' : 'items-start', className)}>
      <span className={cx('display tracking-[-0.015em]', sizes)}>
        {stacked ? (
          <>
            <span className={cx('block', soft)}>Just</span>
            <span className={cx('block', strong)}>Spuds</span>
          </>
        ) : (
          <>
            <span className={soft}>Just</span>
            <span className={strong}> Spuds</span>
          </>
        )}
      </span>
      {showTown && (
        <span className={cx('mt-2 flex w-full items-center gap-2.5', town)}>
          <i className={cx('h-px flex-1', tone === 'light' ? 'bg-white/25' : 'bg-ink/20')} />
          <span className={cx('font-body font-bold uppercase tracking-ultra', tone === 'light' ? 'text-white/80' : 'text-slate-500')}>
            Aylesbury
          </span>
          <i className={cx('h-px flex-1', tone === 'light' ? 'bg-white/25' : 'bg-ink/20')} />
        </span>
      )}
    </div>
  )
}

export function PillarIcon({ name, className }: { name: 'leaf' | 'bake' | 'heart'; className?: string }) {
  const paths: Record<string, JSX.Element> = {
    leaf: <path d="M20 11c0 6-4 10-9 10-2 0-4-1-4-1s0-8 5-11c4-2 8-2 8-2s0 2 0 4Zm-13 9c2-4 5-7 9-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
    bake: (
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none">
        <path d="M5 17h18a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" />
        <path d="M10 10c0-1.5 1.5-1.5 1.5-3S10 4 10 4M14 10c0-1.5 1.5-1.5 1.5-3S14 4 14 4M18 10c0-1.5 1.5-1.5 1.5-3S18 4 18 4" />
      </g>
    ),
    heart: <path d="M14 21s-7-4.4-7-9.2A4 4 0 0 1 14 9a4 4 0 0 1 7 2.8C21 16.6 14 21 14 21Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />,
  }
  return <svg viewBox="0 0 28 26" className={className} aria-hidden="true">{paths[name]}</svg>
}
