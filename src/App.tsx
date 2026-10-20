import { Suspense, lazy, useEffect } from 'react'
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
const StaffPOSPage = lazy(() => import('./pages/StaffPOSPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const DriverDashboardPage = lazy(() => import('./pages/DriverDashboardPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const CustomerFacingDisplayPage = lazy(() => import('./pages/CustomerFacingDisplayPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

import ProtectedRoute from './components/ProtectedRoute'
import { MANAGEMENT_ROLES, SHOP_FLOOR_ROLES } from './services/authStore'

export type SubdomainMode = 'admin' | 'pos' | 'storefront'

export function detectSubdomain(): SubdomainMode {
  if (typeof window === 'undefined') return 'storefront'
  const hostname = window.location.hostname.toLowerCase()
  if (hostname.startsWith('admin.') || hostname === 'admin.localhost') return 'admin'
  if (
    hostname.startsWith('pos.') ||
    hostname.startsWith('till.') ||
    hostname.startsWith('staff.') ||
    hostname === 'pos.localhost'
  ) {
    return 'pos'
  }
  return 'storefront'
}

function ExternalRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to)
  }, [to])
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center p-4">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      <p className="font-bold text-sm text-slate-200">Redirecting to secure portal...</p>
      <a href={to} className="text-xs text-amber-400 hover:underline">
        Click here if not redirected automatically ({to})
      </a>
    </div>
  )
}

export default function App() {
  const subdomain = detectSubdomain()
  const isProduction =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'justspuds.uk' || window.location.hostname === 'www.justspuds.uk')

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
            {/* SUBDOMAIN 1: ADMIN MANAGEMENT (admin.justspuds.uk) */}
            {subdomain === 'admin' ? (
              <Routes>
                <Route
                  path="/"
                  element={
                    <ProtectedRoute allowedRoles={MANAGEMENT_ROLES} portalName="Management Admin Console" loginTab="admin">
                      <AdminPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="admin/*"
                  element={
                    <ProtectedRoute allowedRoles={MANAGEMENT_ROLES} portalName="Management Admin Console" loginTab="admin">
                      <AdminPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="login" element={<LoginPage />} />
                <Route
                  path="*"
                  element={
                    <ProtectedRoute allowedRoles={MANAGEMENT_ROLES} portalName="Management Admin Console" loginTab="admin">
                      <AdminPage />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            ) : subdomain === 'pos' ? (
              /* SUBDOMAIN 2: IN-STORE TILL & KITCHEN (pos.justspuds.uk / till.justspuds.uk) */
              <Routes>
                <Route
                  path="/"
                  element={
                    <ProtectedRoute allowedRoles={SHOP_FLOOR_ROLES} portalName="Food Till & POS" loginTab="staff">
                      <StaffPOSPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="pos/*"
                  element={
                    <ProtectedRoute allowedRoles={SHOP_FLOOR_ROLES} portalName="Food Till & POS" loginTab="staff">
                      <StaffPOSPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="till/*"
                  element={
                    <ProtectedRoute allowedRoles={SHOP_FLOOR_ROLES} portalName="Food Till & POS" loginTab="staff">
                      <StaffPOSPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="staff/*"
                  element={
                    <ProtectedRoute allowedRoles={SHOP_FLOOR_ROLES} portalName="Kitchen Display System" loginTab="staff">
                      <StaffKDSPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="cfd" element={<CustomerFacingDisplayPage />} />
                <Route path="customer-display" element={<CustomerFacingDisplayPage />} />
                <Route path="login" element={<LoginPage />} />
                <Route
                  path="*"
                  element={
                    <ProtectedRoute allowedRoles={SHOP_FLOOR_ROLES} portalName="Food Till & POS" loginTab="staff">
                      <StaffPOSPage />
                    </ProtectedRoute>
                  }
                />
              </Routes>
            ) : (
              /* SUBDOMAIN 3: PUBLIC CUSTOMER STOREFRONT (www.justspuds.uk / justspuds.uk) */
              <Routes>
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

                {/* Redirect production storefront URLs to their dedicated subdomains */}
                <Route
                  path="admin"
                  element={
                    isProduction ? (
                      <ExternalRedirect to="https://admin.justspuds.uk" />
                    ) : (
                      <ProtectedRoute allowedRoles={MANAGEMENT_ROLES} portalName="Management Admin Console" loginTab="admin">
                        <AdminPage />
                      </ProtectedRoute>
                    )
                  }
                />
                <Route
                  path="pos"
                  element={
                    isProduction ? (
                      <ExternalRedirect to="https://pos.justspuds.uk" />
                    ) : (
                      <ProtectedRoute allowedRoles={SHOP_FLOOR_ROLES} portalName="Food Till & POS" loginTab="staff">
                        <StaffPOSPage />
                      </ProtectedRoute>
                    )
                  }
                />
                <Route
                  path="till"
                  element={
                    isProduction ? (
                      <ExternalRedirect to="https://pos.justspuds.uk" />
                    ) : (
                      <ProtectedRoute allowedRoles={SHOP_FLOOR_ROLES} portalName="Food Till & POS" loginTab="staff">
                        <StaffPOSPage />
                      </ProtectedRoute>
                    )
                  }
                />
                <Route
                  path="staff"
                  element={
                    isProduction ? (
                      <ExternalRedirect to="https://pos.justspuds.uk" />
                    ) : (
                      <ProtectedRoute allowedRoles={SHOP_FLOOR_ROLES} portalName="Kitchen Display System" loginTab="staff">
                        <StaffKDSPage />
                      </ProtectedRoute>
                    )
                  }
                />
                <Route path="cfd" element={<CustomerFacingDisplayPage />} />
                <Route path="customer-display" element={<CustomerFacingDisplayPage />} />
                <Route
                  path="driver"
                  element={
                    <ProtectedRoute allowedRoles={['DRIVER', ...MANAGEMENT_ROLES]} portalName="Courier Dispatch" loginTab="staff">
                      <DriverDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="login" element={<LoginPage />} />
              </Routes>
            )}
          </Suspense>
        </CartProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

