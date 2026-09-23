import { Link } from 'react-router-dom'
import { Wordmark } from './Brand'
import { SITE, MAPS_SEARCH_URL } from '../data/site'
import { getBusinessDetails } from '../services/menuStore'

// Staff/admin portals are deliberately not linked from the public storefront —
// they're reached directly at /staff and /admin, gated by the PIN screen there.
const NAV = [
  { to: '/', label: 'Home' },
  { to: '/menu', label: 'Order Online' },
  { to: '/track', label: '🛵 Live Order Tracking' },
  { to: '/story', label: 'Our Story' },
  { to: '/find-us', label: 'Find Us' },
]

export default function Footer() {
  const business = getBusinessDetails()
  // Only real profile pages — a link to instagram.com's homepage helps nobody.
  const socials = [
    { key: 'facebook', label: 'Facebook', href: business.social.facebook },
    { key: 'instagram', label: 'Instagram', href: business.social.instagram },
    { key: 'google', label: 'Google reviews', href: business.social.googleReviews },
  ].filter((s): s is { key: string; label: string; href: string } => Boolean(s.href))
  return (
    <footer className="on-dark bg-ink py-16 text-white">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-12 border-b border-white/10 pb-12 sm:grid-cols-2 lg:grid-cols-4">
          <Wordmark size="sm" />

          <nav aria-label="Footer">
            <p className="label text-white/35">Explore</p>
            <ul className="mt-4 space-y-2.5">
              {NAV.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="ul-draw font-body text-[13px] text-white/65 transition-colors hover:text-white">{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="label text-white/35">Find us</p>
            <address className="mt-4 not-italic font-body text-[13px] leading-relaxed text-white/65">
              {business.addressLines.map((l) => (
                <span key={l} className="block">{l}</span>
              ))}
              <a href={business.phoneHref} className="mt-1 block hover:text-white">{business.phone}</a>
            </address>
            <a href={MAPS_SEARCH_URL} target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-block font-body text-[11px] font-bold uppercase tracking-[0.14em] text-white/80 underline-offset-4 hover:underline">
              Directions
            </a>
          </div>

          <div>
            <p className="label text-white/35">{socials.length ? 'Follow' : 'Opening hours'}</p>
            {socials.length === 0 && <p className="mt-4 font-body text-[13px] text-white/65">{SITE.openingHours.display}</p>}
            <ul className="mt-4 space-y-2.5">
              {socials.map((s) => (
                <li key={s.key}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-[13px] text-white/65 transition-colors hover:text-amber-400"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="label text-white/40">{SITE.tagline}</p>
          <p className="font-body text-[11px] text-white/30">© {new Date().getFullYear()} {SITE.name} {SITE.town}</p>
        </div>
      </div>
    </footer>
  )
}
