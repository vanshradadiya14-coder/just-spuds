import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'
import OrderBar from './OrderBar'
import ScrollProgress from './ScrollProgress'
import CartDrawer from './CartDrawer'
import Toast from './Toast'
import MobileAppDock from './MobileAppDock'
import FixedAmbientBackdrop from './FixedAmbientBackdrop'
import StaffPortalDock from './StaffPortalDock'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useOrderNotifications } from '../hooks/useOrderNotifications'

const ease = [0.16, 1, 0.3, 1] as const

/**
 * Page shell and route transition.
 */
export default function Layout() {
  const location = useLocation()
  const outlet = useOutlet()
  const reduced = useReducedMotion()

  const toTop = () => window.scrollTo(0, 0)

  if (reduced) {
    return (
      <Shell>
        <TopOnChange pathname={location.pathname} />
        {outlet}
      </Shell>
    )
  }

  return (
    <Shell>
      <AnimatePresence mode="wait" initial={false} onExitComplete={toTop}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{
            duration: 0.42,
            ease,
            opacity: { duration: 0.3 },
          }}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  // Mounted once for the whole customer storefront, so order-status notifications
  // work on any page rather than only while the tracking page is open.
  useOrderNotifications()

  return (
    <>
      <FixedAmbientBackdrop />
      <div className="grain" aria-hidden />
      <Navbar />
      <ScrollProgress />
      <main className="relative z-10 min-h-[60svh] pb-28 lg:pb-0">{children}</main>
      <Footer />
      <OrderBar />
      <CartDrawer />
      <Toast />
      <MobileAppDock />
      <StaffPortalDock />
    </>
  )
}

/** Reduced-motion path: no transition to wait on, so reset on change. */
function TopOnChange({ pathname }: { pathname: string }) {
  const seen = useRef(pathname)
  useEffect(() => {
    if (seen.current !== pathname) {
      seen.current = pathname
      window.scrollTo(0, 0)
    }
  }, [pathname])
  return null
}
