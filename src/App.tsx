import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import { CartProvider } from './hooks/useCart'
import ErrorBoundary from './components/ErrorBoundary'

const MenuPage = lazy(() => import('./pages/MenuPage'))
const ProductPage = lazy(() => import('./pages/ProductPage'))
const BuildPage = lazy(() => import('./pages/BuildPage'))
const StoryPage = lazy(() => import('./pages/StoryPage'))
const FindUsPage = lazy(() => import('./pages/FindUsPage'))
const OrderTrackingPage = lazy(() => import('./pages/OrderTrackingPage'))
const StaffKDSPage = lazy(() => import('./pages/StaffKDSPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const DriverDashboardPage = lazy(() => import('./pages/DriverDashboardPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <CartProvider>
          <Suspense
            fallback={
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              </div>
            }
          >
            <Routes>
              {/* PUBLIC CUSTOMER STOREFRONT (with Customer Navbar, Announcement Bar, Footer & Cart) */}
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="menu" element={<MenuPage />} />
                <Route path="menu/:id" element={<ProductPage />} />
                <Route path="build" element={<BuildPage />} />
                <Route path="story" element={<StoryPage />} />
                <Route path="find-us" element={<FindUsPage />} />
                <Route path="track/:orderId" element={<OrderTrackingPage />} />
                <Route path="track" element={<OrderTrackingPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              {/* DEDICATED FULLSCREEN STAFF KITCHEN, COURIER & ADMIN PORTALS (Zero Customer Navbar/Banners) */}
              <Route path="staff" element={<StaffKDSPage />} />
              <Route path="driver" element={<DriverDashboardPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="login" element={<LoginPage />} />
            </Routes>
          </Suspense>
        </CartProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

