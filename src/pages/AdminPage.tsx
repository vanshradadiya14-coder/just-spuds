import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  getDeliverySettings,
  saveDeliverySettings,
  subscribeDeliverySettings,
  type StoreDeliverySettings,
} from '../services/deliverySettingsStore'
import {
  subscribeOrders,
  cancelOrder,
  advanceOrderStatus,
  getMenuStockOverrides,
  toggleItemStock,
  getKitchenPauseState,
  resumeKitchenOrders,
  subscribeKitchenPause,
  getDetailedBusinessAnalytics,
  generateZReport,
  exportOrdersCSV,
  exportCustomersCSV,
  injectSimulatedRushOrders,
  playChimeSoundTest,
  type Order,
  type KitchenPauseState,
  type TimeRange,
  type ZReportData,
} from '../services/orderStore'
import {
  getProducts,
  saveProduct,
  deleteProduct,
  getExtras,
  saveExtra,
  deleteExtra,
  getSauces,
  saveSauce,
  deleteSauce,
  getPromoCodes,
  savePromoCode,
  deletePromoCode,
  getStoreSettings,
  saveStoreSettings,
  getCategories,
  resetMenuToDefaults,
  batchAdjustCategoryPrices,
  subscribeMenu,
  type PromoCode,
  type StoreSettings,
} from '../services/menuStore'
import {
  getCurrentUser,
  subscribeAuth,
  loginWithPin,
  logout,
  hasRole,
  DEMO_USERS,
  type AuthUser,
} from '../services/authStore'
import {
  getDrivers,
  createDriver,
  updateDriverProfile,
  subscribeDrivers,
  type DriverProfile,
} from '../services/driverStore'
import { type Product, type Option } from '../data/menu'
import ThermalReceipt from '../components/ThermalReceipt'
import AdminZReportModal from '../components/AdminZReportModal'
import AdminProductModal from '../components/AdminProductModal'
import ManualOrderFixModal from '../components/ManualOrderFixModal'
import CreateManualOrderModal from '../components/CreateManualOrderModal'
import { gbp, cx } from '../utils/format'
import SmartImage from '../components/SmartImage'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import AdminLiveOrders from './admin/components/AdminLiveOrders'
import { getAuditLogs, subscribeAuditLogs, type AuditLogItem } from '../services/auditStore'
import {
  getBlacklistEntries,
  subscribeBlacklist,
  blacklistPhone,
  unblacklistPhone,
  type BlacklistEntry,
} from '../services/blacklistStore'

type AdminTab = 'overview' | 'orders' | 'products' | 'toppings' | 'promos' | 'crm' | 'delivery' | 'drivers' | 'staff' | 'audit'

export default function AdminPage() {
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser())

  useDocumentMeta({
    title: 'Management Console & Executive Analytics',
    description: 'Store management portal, live sales analytics, menu control, and staff administration for Just Spuds.',
  })
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>(() => getProducts())
  const [extras, setExtras] = useState<Option[]>(() => getExtras())
  const [sauces, setSauces] = useState<Option[]>(() => getSauces())
  const [promos, setPromos] = useState<PromoCode[]>(() => getPromoCodes())
  const [storeSettings, setStoreSettingsState] = useState<StoreSettings>(() => getStoreSettings())
  const [drivers, setDrivers] = useState<DriverProfile[]>(() => getDrivers())
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(() => getAuditLogs())
  const [blacklistEntries, setBlacklistEntries] = useState<BlacklistEntry[]>(() => getBlacklistEntries())

  // Manual resolution & creation modals
  const [fixingOrder, setFixingOrder] = useState<Order | null>(null)
  const [isCreateManualOrderOpen, setIsCreateManualOrderOpen] = useState(false)
  const [newBlacklistPhoneInput, setNewBlacklistPhoneInput] = useState('')
  const [newBlacklistReasonInput, setNewBlacklistReasonInput] = useState('')

  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [timeframe, setTimeframe] = useState<TimeRange>('today')
  const [stockOverrides, setStockOverrides] = useState<Record<string, boolean>>(() => getMenuStockOverrides())

  const activeCategories = getCategories()

  const [searchQuery, setSearchQuery] = useState('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('ALL')
  const [crmSearchQuery, setCrmSearchQuery] = useState('')
  const [driverSearchQuery, setDriverSearchQuery] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'active' | 'delivery' | 'pickup' | 'completed' | 'cancelled'>('all')

  // Modals state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null)
  const [zReportData, setZReportData] = useState<ZReportData | null>(null)
  const [isZReportOpen, setIsZReportOpen] = useState(false)

  // Driver Modal state
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false)
  const [editingDriver, setEditingDriver] = useState<DriverProfile | null>(null)
  const [driverFormName, setDriverFormName] = useState('')
  const [driverFormPhone, setDriverFormPhone] = useState('')
  const [driverFormEmail, setDriverFormEmail] = useState('')
  const [driverFormVehicle, setDriverFormVehicle] = useState<DriverProfile['vehicleType']>('Electric Moped')
  const [driverFormReg, setDriverFormReg] = useState('')
  const [driverFormPin, setDriverFormPin] = useState('7780')

  // New Topping / Sauce Form state
  const [newToppingName, setNewToppingName] = useState('')
  const [newToppingPrice, setNewToppingPrice] = useState('1.00')
  const [newSauceName, setNewSauceName] = useState('')

  // New Promo Code Form state
  const [newPromoCode, setNewPromoCode] = useState('')
  const [newPromoDiscount, setNewPromoDiscount] = useState('10')
  const [newPromoType, setNewPromoType] = useState<'percent' | 'fixed'>('percent')
  const [newPromoMinOrder, setNewPromoMinOrder] = useState('10.00')
  const [newPromoDesc, setNewPromoDesc] = useState('')

  const [currentTime, setCurrentTime] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [kitchenPause, setKitchenPauseState] = useState<KitchenPauseState>(() => getKitchenPauseState())
  const [deliverySettings, setDeliverySettingsState] = useState<StoreDeliverySettings>(() => getDeliverySettings())

  // PIN gate state
  const [adminPin, setAdminPin] = useState('')
  const [adminPinError, setAdminPinError] = useState<string | null>(null)

  useEffect(() => {
    const unsubAuth = subscribeAuth((u) => setUser(u))
    const unsubOrders = subscribeOrders((all) => setOrders(all))
    const unsubDrivers = subscribeDrivers((all) => setDrivers(all))
    const unsubPause = subscribeKitchenPause((kp) => setKitchenPauseState(kp))
    const unsubDeliverySettings = subscribeDeliverySettings((ds) => setDeliverySettingsState(ds))
    const unsubAudit = subscribeAuditLogs((logs) => setAuditLogs(logs))
    const unsubBlacklist = subscribeBlacklist((list) => setBlacklistEntries(list))
    const unsubMenu = subscribeMenu(() => {
      setProducts(getProducts())
      setExtras(getExtras())
      setSauces(getSauces())
      setPromos(getPromoCodes())
      setStoreSettingsState(getStoreSettings())
    })
    setStockOverrides(getMenuStockOverrides())
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)

    return () => {
      unsubAuth()
      unsubOrders()
      unsubDrivers()
      unsubPause()
      unsubDeliverySettings()
      unsubAudit()
      unsubBlacklist()
      unsubMenu()
      clearInterval(timer)
    }
  }, [])

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  const handleAdminPinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const res = loginWithPin(adminPin)
    if (res.ok && hasRole(res.user ?? null, ['ADMIN', 'STORE_MANAGER'])) {
      setAdminPin('')
      setAdminPinError(null)
    } else {
      if (res.ok) logout()
      setAdminPinError('Invalid Admin PIN. (Enter 8888 for Super Admin, 5555 for Manager)')
    }
  }

  const isAuthorized = hasRole(user, ['ADMIN', 'STORE_MANAGER'])

  // Detailed business analytics for overview tab
  const analytics = useMemo(() => {
    return getDetailedBusinessAnalytics(orders, timeframe)
  }, [orders, timeframe])

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchId = ord.shortId.toLowerCase().includes(q)
        const matchName = ord.customer.name.toLowerCase().includes(q)
        const matchPhone = ord.customer.phone.toLowerCase().includes(q)
        if (!matchId && !matchName && !matchPhone) return false
      }
      if (orderStatusFilter === 'active') {
        return !['delivered', 'collected', 'cancelled'].includes(ord.status)
      }
      if (orderStatusFilter === 'delivery') {
        return ord.fulfilment === 'delivery'
      }
      if (orderStatusFilter === 'pickup') {
        return ord.fulfilment === 'pickup'
      }
      if (orderStatusFilter === 'completed') {
        return ['delivered', 'collected'].includes(ord.status)
      }
      if (orderStatusFilter === 'cancelled') {
        return ord.status === 'cancelled'
      }
      return true
    })
  }, [orders, searchQuery, orderStatusFilter])

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (productCategoryFilter !== 'ALL' && p.category !== productCategoryFilter) {
        return false
      }
      if (productSearchQuery.trim()) {
        const q = productSearchQuery.toLowerCase()
        return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      }
      return true
    })
  }, [products, productCategoryFilter, productSearchQuery])

  // Filtered CRM customers list
  const filteredCrmCustomers = useMemo(() => {
    if (!crmSearchQuery.trim()) return analytics.crmCustomers
    const q = crmSearchQuery.toLowerCase()
    return analytics.crmCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.postcode && c.postcode.toLowerCase().includes(q))
    )
  }, [analytics.crmCustomers, crmSearchQuery])

  const handleOpenZReport = () => {
    const report = generateZReport(orders)
    setZReportData(report)
    setIsZReportOpen(true)
  }

  const handleRefundCancel = (orderId: string) => {
    const reason = window.prompt('Enter refund / cancellation rationale (logged to Audit trail):', 'Customer requested cancellation')
    if (reason) {
      cancelOrder(orderId, reason)
    }
  }

  const handleAdvanceStatus = (orderId: string) => {
    advanceOrderStatus(orderId)
  }

  const handleStockToggle = (productId: string, current: boolean) => {
    toggleItemStock(productId, !current)
    setStockOverrides((prev) => ({ ...prev, [productId]: !current }))
  }

  const handleSaveProduct = (prod: Product) => {
    saveProduct(prod)
    setProducts(getProducts())
  }

  const handleDeleteProduct = (productId: string, productName: string) => {
    if (window.confirm(`Are you sure you want to permanently delete "${productName}" from the menu?`)) {
      deleteProduct(productId)
      setProducts(getProducts())
    }
  }

  const handleBatchAdjustPrices = (deltaPence: number) => {
    const label = deltaPence > 0 ? `+${gbp(deltaPence)}` : `-${gbp(Math.abs(deltaPence))}`
    if (window.confirm(`Adjust prices by ${label} across category "${productCategoryFilter}"?`)) {
      const count = batchAdjustCategoryPrices(productCategoryFilter, deltaPence)
      setProducts(getProducts())
      alert(`✓ Updated prices on ${count} products!`)
    }
  }

  const handleSimulateRush = () => {
    injectSimulatedRushOrders()
    alert('⚡ Simulated 2 incoming orders (1 Delivery, 1 Pickup)! Kitchen chime triggered.')
  }

  const handleSoundTest = () => {
    playChimeSoundTest()
  }

  const handleIssueCustomerVoucher = (custName: string) => {
    const code = `VIP-${custName.split(' ')[0].toUpperCase()}-5`
    const promo: PromoCode = {
      code,
      discountPence: 500,
      minOrderPence: 1000,
      description: `£5.00 VIP Courtesy Voucher for ${custName}`,
      active: true,
    }
    savePromoCode(promo)
    setPromos(getPromoCodes())
    navigator.clipboard.writeText(code)
    alert(`🎉 Issued £5 voucher code "${code}"! Copied to clipboard.`)
  }

  const handleSaveDeliverySettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveDeliverySettings(deliverySettings)
    alert(`✅ Store delivery charge updated to £${(deliverySettings.deliveryFeePence / 100).toFixed(2)}! Couriers will earn £${(deliverySettings.deliveryFeePence / 100).toFixed(2)} per delivery.`)
  }

  const onlineDriversCount = useMemo(() => drivers.filter((d) => d.isOnline).length, [drivers])
  const activeDeliveriesList = useMemo(
    () => orders.filter((o) => o.fulfilment === 'delivery' && !['delivered', 'cancelled', 'collected'].includes(o.status)),
    [orders]
  )

  const handleOpenAddDriver = () => {
    setEditingDriver(null)
    setDriverFormName('')
    setDriverFormEmail('')
    setDriverFormPhone('')
    setDriverFormVehicle('Electric Moped')
    setDriverFormReg('')
    setDriverFormPin(String(Math.floor(7780 + Math.random() * 100)))
    setIsDriverModalOpen(true)
  }

  const handleOpenEditDriver = (driver: DriverProfile) => {
    setEditingDriver(driver)
    setDriverFormName(driver.name)
    setDriverFormEmail(driver.email)
    setDriverFormPhone(driver.phone)
    setDriverFormVehicle(driver.vehicleType)
    setDriverFormReg(driver.vehicleReg)
    setDriverFormPin(driver.pin)
    setIsDriverModalOpen(true)
  }

  const handleSaveDriverSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!driverFormName.trim() || !driverFormPhone.trim()) return

    if (editingDriver) {
      updateDriverProfile({
        id: editingDriver.id,
        name: driverFormName.trim(),
        email: driverFormEmail.trim(),
        phone: driverFormPhone.trim(),
        vehicleType: driverFormVehicle,
        vehicleReg: driverFormReg.trim().toUpperCase(),
        pin: driverFormPin.trim(),
      })
    } else {
      createDriver({
        name: driverFormName.trim(),
        email: driverFormEmail.trim() || `${driverFormName.toLowerCase().replace(/\s+/g, '.')}@justspuds.uk`,
        phone: driverFormPhone.trim(),
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        vehicleType: driverFormVehicle,
        vehicleReg: driverFormReg.trim().toUpperCase() || 'AY24 SPD',
        status: 'ACTIVE',
        isOnline: false,
        pin: driverFormPin.trim(),
      })
    }
    setDrivers(getDrivers())
    setIsDriverModalOpen(false)
  }

  const handleToggleDriverStatus = (driverId: string, currentStatus: DriverProfile['status']) => {
    const nextStatus: DriverProfile['status'] = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    updateDriverProfile({ id: driverId, status: nextStatus })
    setDrivers(getDrivers())
  }

  const handleAddExtra = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newToppingName.trim()) return
    const id = newToppingName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const price = Math.round(parseFloat(newToppingPrice || '1.00') * 100)
    saveExtra({ id, label: newToppingName.trim(), price })
    setNewToppingName('')
    setNewToppingPrice('1.00')
    setExtras(getExtras())
  }

  const handleDeleteExtra = (id: string, label: string) => {
    if (window.confirm(`Delete extra topping "${label}"?`)) {
      deleteExtra(id)
      setExtras(getExtras())
    }
  }

  const handleAddSauce = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSauceName.trim()) return
    const id = newSauceName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    saveSauce({ id, label: newSauceName.trim(), price: 0 })
    setNewSauceName('')
    setSauces(getSauces())
  }

  const handleDeleteSauce = (id: string, label: string) => {
    if (window.confirm(`Delete sauce "${label}"?`)) {
      deleteSauce(id)
      setSauces(getSauces())
    }
  }

  const handleAddPromo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPromoCode.trim()) return
    const code = newPromoCode.trim().toUpperCase()
    const isPercent = newPromoType === 'percent'
    const discountVal = parseFloat(newPromoDiscount || '10')
    const minOrderPence = Math.round(parseFloat(newPromoMinOrder || '10') * 100)

    const promo: PromoCode = {
      code,
      discountPercent: isPercent ? discountVal : undefined,
      discountPence: !isPercent ? Math.round(discountVal * 100) : undefined,
      minOrderPence,
      description: newPromoDesc.trim() || `${code} discount voucher`,
      active: true,
    }

    savePromoCode(promo)
    setNewPromoCode('')
    setNewPromoDesc('')
    setPromos(getPromoCodes())
  }

  const handleDeletePromo = (code: string) => {
    if (window.confirm(`Delete voucher code "${code}"?`)) {
      deletePromoCode(code)
      setPromos(getPromoCodes())
    }
  }

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault()
    saveStoreSettings(storeSettings)
    alert('✓ Store Operating Settings Saved Successfully!')
  }

  const handleResetAllMenu = () => {
    if (window.confirm('⚠️ Reset all products, extra toppings, and sauces back to default in-store menu?')) {
      resetMenuToDefaults()
      setProducts(getProducts())
      setExtras(getExtras())
      setSauces(getSauces())
      setPromos(getPromoCodes())
      setStoreSettingsState(getStoreSettings())
    }
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="mb-6 flex items-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 font-body text-xs font-bold text-white hover:bg-white/15 transition"
          >
            <span>←</span>
            <span>Customer Website</span>
          </Link>
          <Link
            to="/staff"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 font-body text-xs font-bold text-amber-300 hover:bg-amber-400 hover:text-ink transition"
          >
            <span>👨‍🍳</span>
            <span>Staff KDS</span>
          </Link>
        </div>

        <div className="w-full max-w-sm rounded-3xl border border-amber-400/40 bg-gradient-to-b from-slate-900 to-black p-8 shadow-2xl text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-amber-400 text-3xl text-ink shadow-glow">
            🔒
          </div>
          <h1 className="display text-2xl text-white font-bold">Admin Management Gate</h1>
          
          {user?.role === 'STAFF' ? (
            <p className="rounded-xl border border-amber-400/40 bg-amber-950/40 p-2.5 font-body text-xs text-amber-300 mt-2 mb-4 text-left">
              ⚠️ <strong>Staff Account:</strong> Kitchen line cook accounts do not have permission to view revenue, audit logs, or edit menu pricing. Enter Manager or Admin PIN to elevate privileges.
            </p>
          ) : (
            <p className="font-body text-xs text-white/60 mt-1 mb-6">
              Enter Admin PIN or log in with credentials to access sales and executive controls.
            </p>
          )}

          <form onSubmit={handleAdminPinSubmit} className="space-y-4">
            <input
              type="password"
              maxLength={4}
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              placeholder="••••"
              autoFocus
              className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-center font-mono text-3xl tracking-[0.5em] text-white focus:border-amber-400 focus:outline-none"
            />

            <div className="grid grid-cols-3 gap-2 pt-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setAdminPin((prev) => (prev.length < 4 ? prev + num : prev))}
                  className="rounded-xl border border-white/10 bg-white/5 py-3 font-mono text-lg font-bold text-white hover:bg-white/15 active:scale-95"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAdminPin('')}
                className="rounded-xl border border-red-500/20 bg-red-950/20 py-3 font-body text-xs font-bold text-red-400 hover:bg-red-900/40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setAdminPin((prev) => (prev.length < 4 ? prev + '0' : prev))}
                className="rounded-xl border border-white/10 bg-white/5 py-3 font-mono text-lg font-bold text-white hover:bg-white/15"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setAdminPin((prev) => prev.slice(0, -1))}
                className="rounded-xl border border-white/10 bg-white/5 py-3 font-body text-xs font-bold text-white hover:bg-white/15"
              >
                ⌫
              </button>
            </div>

            {adminPinError && (
              <p className="rounded-xl bg-red-950/50 border border-red-500/40 p-2.5 font-body text-xs text-red-300">
                {adminPinError}
              </p>
            )}

            <button
              type="submit"
              className="w-full rounded-full bg-amber-400 py-3.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition"
            >
              Authenticate as Admin →
            </button>
          </form>

          <p className="mt-6 text-[11px] text-white/40">
            Admin PIN: <strong className="text-amber-400 font-mono">8888</strong> &bull; Staff KDS: <Link to="/staff" className="text-amber-300 underline">/staff</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 pt-4 sm:pt-6">
      <div className="mx-auto max-w-[1700px] px-4 sm:px-6">

        {/* TOP EXECUTIVE BAR */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-2xl text-ink shadow-glow">
              🥔
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="display text-xl sm:text-2xl text-white font-bold tracking-wide">
                  JUST SPUDS &bull; EXECUTIVE MANAGEMENT
                </h1>
                <span className="rounded-full bg-amber-400/20 border border-amber-400/40 px-2.5 py-0.5 text-[10px] font-black uppercase text-amber-300">
                  {user?.role || 'SUPER ADMIN'}
                </span>
              </div>
              <p className="font-body text-xs text-white/60">
                Aylesbury Market Square Flagship &bull; Manager: <strong>{user?.name}</strong>
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs font-bold text-amber-300">
              🕒 {currentTime.toLocaleTimeString()}
            </div>

            {/* Test & Simulation Actions */}
            <button
              type="button"
              onClick={handleSimulateRush}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/50 bg-amber-400/15 px-3 py-1.5 font-body text-xs font-bold text-amber-300 hover:bg-amber-400 hover:text-ink transition"
              title="Inject 2 test orders into the live queue to test sound & printer"
            >
              <span>⚡</span>
              <span>Simulate Rush</span>
            </button>

            <button
              type="button"
              onClick={handleSoundTest}
              className="inline-flex items-center gap-1 rounded-xl border border-white/20 bg-white/5 px-2.5 py-1.5 font-body text-xs text-white/80 hover:bg-white/15"
              title="Test kitchen chime audio"
            >
              <span>🔊</span>
              <span>Sound Test</span>
            </button>

            {kitchenPause.isPaused ? (
              <button
                type="button"
                onClick={resumeKitchenOrders}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow hover:bg-emerald-400 transition animate-pulse"
              >
                <span>▶️ Resume Live Orders</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Store Open ({storeSettings.openTime} – {storeSettings.closeTime})
              </span>
            )}

            {/* Online Ordering Launch Toggle */}
            <button
              type="button"
              onClick={() => {
                const nextState = !deliverySettings.isOnlineOrderingEnabled
                saveDeliverySettings({ isOnlineOrderingEnabled: nextState })
              }}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-body text-xs font-black uppercase tracking-wider transition shadow',
                deliverySettings.isOnlineOrderingEnabled
                  ? 'bg-emerald-500 text-ink hover:bg-emerald-400'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-400/50 hover:bg-amber-500/30'
              )}
              title="Toggle Online Ordering (Delivery & Pickup)"
            >
              <span>{deliverySettings.isOnlineOrderingEnabled ? '🟢 Online Orders: ACTIVE' : '⏸️ Online Orders: PAUSED'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenZReport}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-1.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow hover:bg-amber-300 transition"
            >
              <span>🧾</span>
              <span>Z-Report</span>
            </button>

            <button
              type="button"
              onClick={() => exportOrdersCSV(orders)}
              className="inline-flex items-center gap-1 rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 font-body text-xs font-bold text-white hover:bg-white/15"
            >
              <span>📥</span>
              <span>Export Ledger</span>
            </button>

            <Link
              to="/pos"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-1.5 font-body text-xs font-black text-ink shadow hover:bg-emerald-400 transition"
              title="Open Counter Till with Cash Drawer"
            >
              <span>🥔</span>
              <span>Counter Till POS</span>
            </Link>

            <Link
              to="/staff"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 font-body text-xs font-bold text-amber-300 hover:bg-amber-400 hover:text-ink transition"
            >
              <span>👨‍🍳</span>
              <span>Staff KDS</span>
            </Link>


            <button
              type="button"
              onClick={toggleFullScreen}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 font-body text-xs font-bold text-white hover:bg-white/15"
            >
              {isFullscreen ? '🗗 Exit' : '⛶ Fullscreen'}
            </button>

            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 font-body text-xs font-bold text-white hover:bg-white/10"
            >
              Sign Out 🔒
            </button>
          </div>
        </div>

        {/* PRIMARY NAVIGATION TABS */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={cx(
                'rounded-xl px-4 py-2 font-body text-xs font-bold transition flex items-center gap-1.5',
                activeTab === 'overview' ? 'bg-amber-400 text-ink font-black shadow-glow' : 'text-white/70 hover:text-white bg-white/5'
              )}
            >
              <span>📊</span>
              <span>Overview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={cx(
                'rounded-xl px-4 py-2 font-body text-xs font-bold transition flex items-center gap-1.5',
                activeTab === 'orders' ? 'bg-amber-400 text-ink font-black shadow-glow' : 'text-white/70 hover:text-white bg-white/5'
              )}
            >
              <span>📋</span>
              <span>Live Orders</span>
              {analytics.activeCount > 0 && (
                <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-black text-ink">
                  {analytics.activeCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('products')}
              className={cx(
                'rounded-xl px-4 py-2 font-body text-xs font-bold transition flex items-center gap-1.5',
                activeTab === 'products' ? 'bg-amber-400 text-ink font-black shadow-glow' : 'text-white/70 hover:text-white bg-white/5'
              )}
            >
              <span>🥔</span>
              <span>Product Studio</span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] text-white">
                {products.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('toppings')}
              className={cx(
                'rounded-xl px-4 py-2 font-body text-xs font-bold transition flex items-center gap-1.5',
                activeTab === 'toppings' ? 'bg-amber-400 text-ink font-black shadow-glow' : 'text-white/70 hover:text-white bg-white/5'
              )}
            >
              <span>🧀</span>
              <span>Toppings &amp; Sauces</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('promos')}
              className={cx(
                'rounded-xl px-4 py-2 font-body text-xs font-bold transition flex items-center gap-1.5',
                activeTab === 'promos' ? 'bg-amber-400 text-ink font-black shadow-glow' : 'text-white/70 hover:text-white bg-white/5'
              )}
            >
              <span>🎟️</span>
              <span>Promo Vouchers</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('crm')}
              className={cx(
                'rounded-xl px-4 py-2 font-body text-xs font-bold transition flex items-center gap-1.5',
                activeTab === 'crm' ? 'bg-amber-400 text-ink font-black shadow-glow' : 'text-white/70 hover:text-white bg-white/5'
              )}
            >
              <span>👥</span>
              <span>Customer CRM</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('delivery')}
              className={cx(
                'rounded-xl px-4 py-2 font-body text-xs font-bold transition flex items-center gap-1.5',
                activeTab === 'delivery' ? 'bg-amber-400 text-ink font-black shadow-glow' : 'text-white/70 hover:text-white bg-white/5'
              )}
            >
              <span>⚙️</span>
              <span>Store Ops</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('drivers')}
              className={cx(
                'rounded-xl px-4 py-2 font-body text-xs font-bold transition flex items-center gap-1.5',
                activeTab === 'drivers' ? 'bg-amber-400 text-ink font-black shadow-glow' : 'text-white/70 hover:text-white bg-white/5'
              )}
            >
              <span>🚚</span>
              <span>Drivers &amp; Fleet</span>
              {onlineDriversCount > 0 && (
                <span className="rounded-full bg-emerald-500 px-1.5 py-0.2 text-[10px] font-black text-slate-950">
                  {onlineDriversCount} Online
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('staff')}
              className={cx(
                'rounded-xl px-4 py-2 font-body text-xs font-bold transition flex items-center gap-1.5',
                activeTab === 'staff' ? 'bg-amber-400 text-ink font-black shadow-glow' : 'text-white/70 hover:text-white bg-white/5'
              )}
            >
              <span>👨‍🍳</span>
              <span>Staff Accounts</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={cx(
                'rounded-xl px-4 py-2 font-body text-xs font-bold transition flex items-center gap-1.5',
                activeTab === 'audit' ? 'bg-amber-400 text-ink font-black shadow-glow' : 'text-white/70 hover:text-white bg-white/5'
              )}
            >
              <span>🛡️</span>
              <span>Audit Trail</span>
            </button>
          </div>

          {activeTab === 'overview' && (
            <div className="flex items-center gap-1.5 rounded-2xl bg-white/5 p-1 border border-white/10">
              {(
                [
                  { key: 'today', label: 'Today' },
                  { key: 'yesterday', label: 'Yesterday' },
                  { key: '7days', label: '7 Days' },
                  { key: '30days', label: '30 Days' },
                  { key: 'all', label: 'All' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTimeframe(t.key)}
                  className={cx(
                    'rounded-xl px-3 py-1.5 font-body text-xs font-bold transition',
                    timeframe === t.key
                      ? 'bg-amber-400 text-ink font-black shadow'
                      : 'text-white/60 hover:text-white'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* TAB 1: EXECUTIVE OVERVIEW                                      */}
        {/* ============================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <div className="rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-950/20 via-slate-900 to-slate-900 p-5 shadow-lg">
                <span className="font-body text-[10px] font-bold uppercase tracking-wider text-amber-300/80">
                  Gross Revenue
                </span>
                <p className="display text-3xl text-amber-400 font-bold mt-1">
                  {gbp(analytics.grossRevenue)}
                </p>
                <div className="mt-2 flex items-center justify-between text-[10px] text-white/60">
                  <span>Net: {gbp(analytics.estimatedNetProfit)}</span>
                  <span className="text-emerald-400 font-bold">~{analytics.grossMarginPercent}% margin</span>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg">
                <span className="font-body text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Completed Orders
                </span>
                <p className="display text-3xl text-white font-bold mt-1">
                  {analytics.completedCount}
                </p>
                <div className="mt-2 flex items-center gap-2 text-[10px]">
                  <span className="text-amber-300 font-bold">🛵 {analytics.deliveryPercent}% Del.</span>
                  <span className="text-slate-400">&bull;</span>
                  <span className="text-emerald-400 font-bold">🛍️ {analytics.pickupPercent}% Pick.</span>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg">
                <span className="font-body text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Avg Order Value (AOV)
                </span>
                <p className="display text-3xl text-white font-bold mt-1">
                  {gbp(analytics.aovPence)}
                </p>
                <span className="text-[10px] text-emerald-400 font-semibold mt-2 block">
                  +14% vs Deliveroo standard
                </span>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg">
                <span className="font-body text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Kitchen Velocity
                </span>
                <p className="display text-3xl text-amber-300 font-bold mt-1">
                  {analytics.avgPrepTimeMins}m
                </p>
                <span className="text-[10px] text-emerald-400 font-semibold mt-2 block">
                  ✓ Target &lt;18m maintained
                </span>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg">
                <span className="font-body text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Staff Tip Pool
                </span>
                <p className="display text-3xl text-emerald-400 font-bold mt-1">
                  {gbp(analytics.tipsTotal)}
                </p>
                <span className="text-[10px] text-white/60 font-semibold mt-2 block">
                  100% to Kitchen &amp; Drivers
                </span>
              </div>

              <div className="rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-900 p-5 shadow-lg">
                <span className="font-body text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  Aggregator Savings
                </span>
                <p className="display text-3xl text-emerald-400 font-bold mt-1">
                  {gbp(analytics.aggregatorSavingsPence)}
                </p>
                <span className="text-[10px] text-emerald-300/80 font-semibold mt-2 block">
                  Kept in-house (0% commission)
                </span>
              </div>
            </div>

            {/* CHARTS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="display text-lg text-white font-bold">
                      Hourly Rush-Hour Heatmap
                    </h2>
                    <p className="font-body text-xs text-white/60">
                      Order volume across operating hours ({storeSettings.openTime} – {storeSettings.closeTime})
                    </p>
                  </div>
                  <span className="text-[10px] text-amber-400 font-bold">● Peak Rush (12-2pm / 6-8pm)</span>
                </div>

                <div className="pt-4">
                  <div className="grid grid-cols-12 gap-2 h-44 items-end border-b border-white/10 pb-2">
                    {analytics.hourlyRush.map((slot) => {
                      const maxCount = Math.max(...analytics.hourlyRush.map((s) => s.count), 1)
                      const heightPercent = Math.max(12, Math.round((slot.count / maxCount) * 100))
                      const isPeak = (slot.hour >= 12 && slot.hour <= 14) || (slot.hour >= 18 && slot.hour <= 20)

                      return (
                        <div key={slot.hour} className="flex flex-col items-center h-full justify-end group">
                          <span className="text-[9px] font-mono text-white/70 opacity-0 group-hover:opacity-100 transition mb-1 font-bold">
                            {slot.count}
                          </span>
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className={cx(
                              'w-full rounded-t-xl transition-all duration-500 group-hover:brightness-125 cursor-pointer relative',
                              isPeak ? 'bg-gradient-to-t from-amber-500 to-amber-300 shadow-glow' : 'bg-white/20'
                            )}
                            title={`${slot.label}: ${slot.count} orders (${gbp(slot.revenue)})`}
                          />
                        </div>
                      )
                    })}
                  </div>
                  <div className="grid grid-cols-12 gap-2 pt-2 text-center text-[9px] font-mono text-white/50">
                    {analytics.hourlyRush.map((slot) => (
                      <span key={slot.hour} className="truncate">
                        {slot.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="display text-lg text-white font-bold">
                    7-Day Revenue Trend
                  </h2>
                  <span className="text-xs font-mono font-bold text-amber-400">
                    {gbp(analytics.dailyRevenue.reduce((s, d) => s + d.revenue, 0))}
                  </span>
                </div>

                <div className="pt-4 space-y-3">
                  {analytics.dailyRevenue.map((day) => {
                    const maxRev = Math.max(...analytics.dailyRevenue.map((d) => d.revenue), 1000)
                    const barPercent = Math.round((day.revenue / maxRev) * 100)
                    return (
                      <div key={day.date} className="flex items-center gap-3 text-xs">
                        <span className="font-mono text-[11px] text-white/60 w-16 shrink-0">
                          {day.label}
                        </span>
                        <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
                          <div
                            style={{ width: `${barPercent}%` }}
                            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-700"
                          />
                        </div>
                        <span className="font-mono font-bold text-white text-[11px] w-16 text-right shrink-0">
                          {gbp(day.revenue)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: LIVE ORDERS STREAM                                      */}
        {/* ============================================================== */}
        {activeTab === 'orders' && (
          <AdminLiveOrders
            orderStatusFilter={orderStatusFilter}
            setOrderStatusFilter={setOrderStatusFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filteredOrders={filteredOrders}
            exportOrdersCSV={exportOrdersCSV}
            handleAdvanceStatus={handleAdvanceStatus}
            setPrintingOrder={setPrintingOrder}
            handleRefundCancel={handleRefundCancel}
            setFixingOrder={setFixingOrder}
            setIsCreateManualOrderOpen={setIsCreateManualOrderOpen}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 3: PRODUCT STUDIO (FULL CRUD & BATCH PRICE ADJUSTER)       */}
        {/* ============================================================== */}
        {activeTab === 'products' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="display text-xl text-white font-bold">
                  Menu &amp; Product Management Studio (Full CRUD)
                </h2>
                <p className="font-body text-xs text-white/60">
                  Add new dishes, batch adjust prices, update photos, edit dietary tags, or delete items.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleResetAllMenu}
                  className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 font-body text-xs font-bold text-white hover:bg-white/10"
                >
                  🔄 Reset Defaults
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditingProduct(null)
                    setIsProductModalOpen(true)
                  }}
                  className="rounded-xl bg-amber-400 px-4 py-2 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition flex items-center gap-1.5"
                >
                  <span>➕</span>
                  <span>Add New Menu Item</span>
                </button>
              </div>
            </div>

            {/* Quick Batch Price Adjuster Banner */}
            <div className="rounded-2xl border border-amber-400/30 bg-amber-950/20 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏷️</span>
                <div>
                  <p className="font-body text-xs font-bold text-amber-300">
                    Quick Batch Price Adjuster ({productCategoryFilter} items)
                  </p>
                  <p className="text-[11px] text-white/60">
                    Quickly shift prices up or down for inflation, promotions, or ingredient cost changes.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBatchAdjustPrices(50)}
                  className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-1.5 font-mono text-xs font-bold text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 transition"
                >
                  +£0.50
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchAdjustPrices(-50)}
                  className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-1.5 font-mono text-xs font-bold text-red-300 hover:bg-red-500 hover:text-white transition"
                >
                  -£0.50
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchAdjustPrices(100)}
                  className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-1.5 font-mono text-xs font-bold text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 transition"
                >
                  +£1.00
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchAdjustPrices(-100)}
                  className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-1.5 font-mono text-xs font-bold text-red-300 hover:bg-red-500 hover:text-white transition"
                >
                  -£1.00
                </button>
              </div>
            </div>

            {/* Category & Search Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setProductCategoryFilter('ALL')}
                  className={cx(
                    'rounded-xl px-3 py-1.5 font-body text-xs font-bold transition',
                    productCategoryFilter === 'ALL'
                      ? 'bg-amber-400 text-ink font-black shadow'
                      : 'bg-white/5 text-white/70 hover:text-white'
                  )}
                >
                  All Categories
                </button>
                {activeCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setProductCategoryFilter(c.id)}
                    className={cx(
                      'rounded-xl px-3 py-1.5 font-body text-xs font-bold transition',
                      productCategoryFilter === c.id
                        ? 'bg-amber-400 text-ink font-black shadow'
                        : 'bg-white/5 text-white/70 hover:text-white'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                placeholder="Search products by title or description..."
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 font-body text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none w-full sm:w-72"
              />
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.map((product) => {
                const isOutOfStock = stockOverrides[product.id] === false
                return (
                  <div
                    key={product.id}
                    className={cx(
                      'rounded-3xl border p-5 flex flex-col justify-between gap-4 transition-all',
                      isOutOfStock
                        ? 'border-red-500/40 bg-red-950/20 shadow-lg'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    )}
                  >
                    <div className="space-y-3">
                      <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden bg-black/30 relative">
                        <SmartImage src={product.image} alt={product.name} className="h-full w-full" cover />
                        <span className="absolute top-2.5 right-2.5 rounded-full bg-amber-400 px-2.5 py-0.5 font-mono text-xs font-black text-ink shadow">
                          {gbp(product.price)}
                        </span>
                        {product.vegetarian && (
                          <span className="absolute bottom-2.5 left-2.5 rounded-lg bg-emerald-950/80 border border-emerald-400/40 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            🌱 Veg
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                          {product.category}
                        </span>
                        <h3 className="font-body text-sm font-bold text-white mt-0.5">{product.name}</h3>
                        <p className="font-body text-[11px] text-white/60 line-clamp-2 mt-1">
                          {product.description}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-white/10">
                      {/* Stock 86'ing Button */}
                      <button
                        type="button"
                        onClick={() => handleStockToggle(product.id, !isOutOfStock)}
                        className={cx(
                          'w-full rounded-xl py-2 font-body text-[11px] font-black uppercase tracking-wider transition shadow',
                          isOutOfStock ? 'bg-red-500 text-white' : 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500 hover:text-slate-950'
                        )}
                      >
                        {isOutOfStock ? '🔴 86’d (Sold Out)' : '🟢 In Stock'}
                      </button>

                      {/* Edit & Delete Action Row */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct(product)
                            setIsProductModalOpen(true)
                          }}
                          className="rounded-xl border border-white/20 bg-white/5 py-1.5 font-body text-xs font-bold text-amber-300 hover:bg-white/15 transition"
                        >
                          ✏️ Edit Item
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(product.id, product.name)}
                          className="rounded-xl border border-red-500/30 bg-red-950/20 py-1.5 font-body text-xs font-bold text-red-400 hover:bg-red-900/40 transition"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: EXTRA TOPPINGS & SAUCES STUDIO                          */}
        {/* ============================================================== */}
        {activeTab === 'toppings' && (
          <div className="space-y-8">
            <div>
              <h2 className="display text-xl text-white font-bold">
                Extra Toppings &amp; Sauces Studio
              </h2>
              <p className="font-body text-xs text-white/60">
                Add, remove, and adjust prices for custom jacket potato toppings and sauces. Changes instantly update the custom potato builder.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Extra Toppings Section */}
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
                <h3 className="display text-lg text-white font-bold">
                  🧀 Extra Toppings &amp; Cheeses
                </h3>

                {/* Add Extra Form */}
                <form onSubmit={handleAddExtra} className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newToppingName}
                    onChange={(e) => setNewToppingName(e.target.value)}
                    placeholder="New Topping (e.g. Crispy Chorizo)"
                    className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 font-body text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                  />
                  <div className="w-24 relative">
                    <span className="absolute left-2.5 top-2 text-xs font-bold text-amber-400">£</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      required
                      value={newToppingPrice}
                      onChange={(e) => setNewToppingPrice(e.target.value)}
                      placeholder="1.00"
                      className="w-full rounded-xl border border-white/20 bg-white/10 pl-6 pr-2 py-2 font-mono text-xs text-white focus:border-amber-400 focus:outline-none font-bold"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl bg-amber-400 px-4 py-2 font-body text-xs font-black uppercase text-ink hover:bg-amber-300 transition"
                  >
                    + Add
                  </button>
                </form>

                {/* Extras List */}
                <div className="divide-y divide-white/10">
                  {extras.map((extra) => (
                    <div key={extra.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="font-body text-xs font-bold text-white">{extra.label}</p>
                        <p className="font-mono text-[11px] text-amber-400">+{gbp(extra.price)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteExtra(extra.id, extra.label)}
                        className="rounded-lg border border-red-500/30 bg-red-950/20 px-2.5 py-1 text-xs text-red-400 hover:bg-red-900/40"
                      >
                        Delete ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sauces Section */}
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
                <h3 className="display text-lg text-white font-bold">
                  🍯 Complimentary Sauces &amp; Dressings
                </h3>

                {/* Add Sauce Form */}
                <form onSubmit={handleAddSauce} className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newSauceName}
                    onChange={(e) => setNewSauceName(e.target.value)}
                    placeholder="New Sauce (e.g. Smoky Sriracha Mayo)"
                    className="flex-1 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 font-body text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-amber-400 px-4 py-2 font-body text-xs font-black uppercase text-ink hover:bg-amber-300 transition"
                  >
                    + Add Sauce
                  </button>
                </form>

                {/* Sauces List */}
                <div className="divide-y divide-white/10">
                  {sauces.map((sauce) => (
                    <div key={sauce.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="font-body text-xs font-bold text-white">{sauce.label}</p>
                        <span className="text-[10px] text-emerald-400 font-bold">Included Free</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSauce(sauce.id, sauce.label)}
                        className="rounded-lg border border-red-500/30 bg-red-950/20 px-2.5 py-1 text-xs text-red-400 hover:bg-red-900/40"
                      >
                        Delete ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: PROMO CODES & DISCOUNTS MANAGER                         */}
        {/* ============================================================== */}
        {activeTab === 'promos' && (
          <div className="space-y-6">
            <div>
              <h2 className="display text-xl text-white font-bold">
                Promotional Vouchers &amp; Discount Code Manager
              </h2>
              <p className="font-body text-xs text-white/60">
                Create coupon codes for customer marketing, configure percentage or fixed discounts, and track usage.
              </p>
            </div>

            {/* Add Promo Code Form */}
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
              <h3 className="display text-base text-white font-bold mb-4">Create New Promotional Voucher</h3>
              <form onSubmit={handleAddPromo} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-white/60 mb-1">Voucher Code</label>
                  <input
                    type="text"
                    required
                    value={newPromoCode}
                    onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                    placeholder="e.g. SPUD20"
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs text-white uppercase font-bold focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-white/60 mb-1">Discount Type</label>
                  <select
                    value={newPromoType}
                    onChange={(e) => setNewPromoType(e.target.value as 'percent' | 'fixed')}
                    className="w-full rounded-xl border border-white/20 bg-slate-800 px-3 py-2 font-body text-xs text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="percent">Percentage (%) Off</option>
                    <option value="fixed">Fixed Amount (£) Off</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-white/60 mb-1">
                    {newPromoType === 'percent' ? 'Discount %' : 'Discount £'}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={newPromoDiscount}
                    onChange={(e) => setNewPromoDiscount(e.target.value)}
                    placeholder="10"
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs text-white font-bold focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-white/60 mb-1">Min Order (£)</label>
                  <input
                    type="number"
                    step="1"
                    value={newPromoMinOrder}
                    onChange={(e) => setNewPromoMinOrder(e.target.value)}
                    placeholder="10.00"
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-amber-400 py-2.5 font-body text-xs font-black uppercase text-ink shadow hover:bg-amber-300 transition"
                  >
                    + Create Voucher
                  </button>
                </div>
              </form>
            </div>

            {/* Active Promo Codes List */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {promos.map((p) => (
                <div key={p.code} className="rounded-3xl border border-amber-400/30 bg-white/5 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="rounded-xl bg-amber-400 px-3 py-1 font-mono text-xs font-black text-ink shadow">
                      {p.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeletePromo(p.code)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete ✕
                    </button>
                  </div>

                  <p className="font-body text-xs text-white font-bold">{p.description}</p>

                  <div className="text-[11px] text-white/60 space-y-1">
                    <p>Benefit: <strong className="text-emerald-400">{p.discountPercent ? `${p.discountPercent}% Off` : `£${((p.discountPence || 0) / 100).toFixed(2)} Off`}</strong></p>
                    <p>Minimum Basket: £{((p.minOrderPence || 0) / 100).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 6: CUSTOMER CRM (WITH DIRECT VIP COURTESY VOUCHERS)        */}
        {/* ============================================================== */}
        {activeTab === 'crm' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="display text-xl text-white font-bold">
                  Customer Intelligence &amp; Marketing CRM
                </h2>
                <p className="font-body text-xs text-white/60">
                  Track repeat customer frequencies, top spenders, and issue courtesy VIP promo vouchers directly.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={crmSearchQuery}
                  onChange={(e) => setCrmSearchQuery(e.target.value)}
                  placeholder="Search customer name, phone, email..."
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 font-body text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none w-full sm:w-72"
                />
                <button
                  type="button"
                  onClick={() => exportCustomersCSV(filteredCrmCustomers)}
                  className="rounded-xl bg-amber-400 px-4 py-2 font-body text-xs font-black uppercase tracking-wider text-ink shadow hover:bg-amber-300 whitespace-nowrap flex items-center gap-1.5"
                >
                  <span>📥</span>
                  <span>Export CRM (CSV)</span>
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden shadow-2xl">
              <table className="w-full text-left font-body text-xs">
                <thead className="border-b border-white/10 bg-white/5 text-[10px] font-bold uppercase text-white/50">
                  <tr>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Contact Info</th>
                    <th className="p-4">Delivery Postcode</th>
                    <th className="p-4">Total Orders</th>
                    <th className="p-4">Lifetime Spend</th>
                    <th className="p-4">Favorite Dish</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {filteredCrmCustomers.map((cust, idx) => (
                    <tr key={cust.id} className="hover:bg-white/[0.02] transition">
                      <td className="p-4 flex items-center gap-3">
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-400/20 font-bold text-amber-300 text-xs">
                          {cust.name.charAt(0)}
                        </span>
                        <div>
                          <p className="font-bold text-white">{cust.name}</p>
                          <span className="text-[10px] text-amber-400 font-bold">
                            {idx === 0 ? '👑 Top Spud Fan' : idx < 3 ? '⭐ Regular' : 'Customer'}
                          </span>
                        </div>
                      </td>

                      <td className="p-4">
                        <p className="font-mono text-white/90">{cust.phone}</p>
                        <p className="text-[11px] text-white/50">{cust.email}</p>
                      </td>

                      <td className="p-4 font-mono font-bold text-white/80">
                        {cust.postcode || 'In-Store Pickup'}
                      </td>

                      <td className="p-4">
                        <span className="rounded-lg bg-white/10 px-2.5 py-1 font-mono font-bold text-white">
                          {cust.orderCount} orders
                        </span>
                      </td>

                      <td className="p-4 font-bold text-emerald-400 text-sm">
                        {gbp(cust.totalSpend)}
                      </td>

                      <td className="p-4 text-white/80 max-w-xs truncate">
                        {cust.favoriteItem}
                      </td>

                      <td className="p-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleIssueCustomerVoucher(cust.name)}
                          className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-400 hover:text-ink transition"
                          title="Generate a £5.00 courtesy voucher code for this customer"
                        >
                          🎁 Issue £5 Voucher
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* FRAUD & ABUSE PREVENTION: BLACKLIST ROSTER */}
            <div className="rounded-3xl border border-red-500/30 bg-red-950/10 p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-red-500/20 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🚨</span>
                    <h3 className="display text-lg text-white font-bold">
                      Fraud Prevention: Flagged &amp; Blacklisted Phone Numbers
                    </h3>
                  </div>
                  <p className="font-body text-xs text-white/60">
                    Blocks abusive customers or prank callers from ordering with pay-on-arrival / counter payment.
                  </p>
                </div>
                <span className="rounded-full bg-red-500/20 border border-red-500/40 px-3 py-1 text-xs font-bold text-red-300">
                  {blacklistEntries.length} Blocked
                </span>
              </div>

              {/* Add Blacklist Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!newBlacklistPhoneInput.trim()) return
                  blacklistPhone(
                    newBlacklistPhoneInput,
                    newBlacklistReasonInput.trim() || 'Manual block by admin',
                    user?.name || 'Store Manager'
                  )
                  setNewBlacklistPhoneInput('')
                  setNewBlacklistReasonInput('')
                }}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="tel"
                  required
                  placeholder="Telephone number to block (e.g. 07700 900123)"
                  value={newBlacklistPhoneInput}
                  onChange={(e) => setNewBlacklistPhoneInput(e.target.value)}
                  className="rounded-xl border border-white/20 bg-slate-800 px-3.5 py-2 text-xs text-white placeholder:text-white/40 focus:border-red-400 focus:outline-none flex-1"
                />
                <input
                  type="text"
                  placeholder="Reason for block (e.g. Fake address / refused delivery)"
                  value={newBlacklistReasonInput}
                  onChange={(e) => setNewBlacklistReasonInput(e.target.value)}
                  className="rounded-xl border border-white/20 bg-slate-800 px-3.5 py-2 text-xs text-white placeholder:text-white/40 focus:border-red-400 focus:outline-none flex-1"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-red-500 px-4 py-2 font-bold text-xs uppercase text-white hover:bg-red-400 transition whitespace-nowrap shadow"
                >
                  🚫 Block Number
                </button>
              </form>

              {/* Blacklist Table */}
              {blacklistEntries.length === 0 ? (
                <p className="text-xs text-white/50 italic py-2">
                  No telephone numbers are currently blacklisted. You can flag malicious numbers directly from any live order.
                </p>
              ) : (
                <div className="divide-y divide-white/10 rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                  {blacklistEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-red-300">{entry.phone}</span>
                          {entry.customerName && (
                            <span className="text-white font-bold">({entry.customerName})</span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/60 mt-0.5">
                          Reason: <span className="text-white/80">{entry.reason}</span> • Blocked by {entry.blockedBy} on {new Date(entry.blockedAt).toLocaleDateString()}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => unblacklistPhone(entry.phone)}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-1 font-bold text-emerald-300 hover:bg-emerald-500/30 transition text-xs whitespace-nowrap self-start sm:self-auto"
                      >
                        🟢 Unblock Number
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 7: STORE OPERATIONS & OPERATING HOURS                      */}
        {/* ============================================================== */}
        {activeTab === 'delivery' && (
          <div className="space-y-6">
            <div>
              <h2 className="display text-xl text-white font-bold flex items-center gap-2">
                <span>⚙️</span>
                <span>Store Operating Parameters &amp; Delivery Settings</span>
              </h2>
              <p className="font-body text-xs text-white/60">
                Configure opening hours, emergency announcement banners, customer delivery fees, and courier payout rates.
              </p>
            </div>

            {/* DYNAMIC DELIVERY FEE & COURIER PAYOUT CONFIGURATION CARD */}
            <div className="rounded-3xl border-2 border-amber-400/40 bg-gradient-to-br from-slate-900 via-slate-900/90 to-amber-950/30 p-6 sm:p-8 shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-lg text-ink font-bold shadow-glow">
                      🛵
                    </span>
                    <h3 className="display text-lg text-white font-bold">Delivery Charge &amp; Courier Earnings Control</h3>
                  </div>
                  <p className="font-body text-xs text-white/60 mt-1">
                    Set the base delivery charge for online food orders and configure driver earnings per delivery.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-emerald-400 self-start sm:self-auto">
                  ● Active Charge: £{(deliverySettings.deliveryFeePence / 100).toFixed(2)}
                </span>
              </div>

              <form onSubmit={handleSaveDeliverySettingsSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* 1. Customer Delivery Charge (£) */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3.5">
                    <label className="block font-body text-xs font-bold uppercase tracking-wider text-amber-300">
                      💰 Customer Delivery Charge (£)
                    </label>
                    
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-2xl font-black text-amber-400">£</span>
                      <input
                        type="number"
                        step="0.10"
                        min="0"
                        max="20"
                        value={(deliverySettings.deliveryFeePence / 100).toFixed(2)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setDeliverySettingsState((s) => ({ ...s, deliveryFeePence: Math.round(val * 100) }))
                        }}
                        className="w-full rounded-xl border border-amber-400/40 bg-black/50 px-4 py-3 font-mono text-2xl font-bold text-white focus:border-amber-400 focus:outline-none"
                      />
                    </div>

                    {/* Quick Presets */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Quick Presets:</span>
                      <div className="flex flex-wrap gap-2">
                        {[300, 350, 400, 450, 500].map((feePence) => (
                          <button
                            key={feePence}
                            type="button"
                            onClick={() => setDeliverySettingsState((s) => ({ ...s, deliveryFeePence: feePence }))}
                            className={cx(
                              'rounded-xl px-3 py-1.5 font-mono text-xs font-bold transition-all',
                              deliverySettings.deliveryFeePence === feePence
                                ? 'bg-amber-400 text-ink font-black shadow-glow scale-[1.03]'
                                : 'bg-white/10 text-white/80 hover:bg-white/20'
                            )}
                          >
                            £{(feePence / 100).toFixed(2)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 2. Free Delivery Threshold (£) */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3.5">
                    <label className="block font-body text-xs font-bold uppercase tracking-wider text-amber-300">
                      🎁 Free Delivery Minimum Subtotal (£)
                    </label>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-2xl font-black text-amber-400">£</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="1000"
                        value={(deliverySettings.freeDeliveryThresholdPence / 100).toFixed(2)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          setDeliverySettingsState((s) => ({ ...s, freeDeliveryThresholdPence: Math.round(val * 100) }))
                        }}
                        className="w-full rounded-xl border border-amber-400/40 bg-black/50 px-4 py-3 font-mono text-2xl font-bold text-white focus:border-amber-400 focus:outline-none"
                      />
                    </div>

                    {/* Quick Presets */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Quick Presets:</span>
                      <div className="flex flex-wrap gap-2">
                        {[1500, 2000, 2500, 3000, 99900].map((threshPence) => (
                          <button
                            key={threshPence}
                            type="button"
                            onClick={() => setDeliverySettingsState((s) => ({ ...s, freeDeliveryThresholdPence: threshPence }))}
                            className={cx(
                              'rounded-xl px-3 py-1.5 font-mono text-xs font-bold transition-all',
                              deliverySettings.freeDeliveryThresholdPence === threshPence
                                ? 'bg-amber-400 text-ink font-black shadow-glow scale-[1.03]'
                                : 'bg-white/10 text-white/80 hover:bg-white/20'
                            )}
                          >
                            {threshPence >= 99000 ? 'No Free Delivery' : `£${(threshPence / 100).toFixed(0)}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>

                {/* LIVE COURIER PAYOUT PREVIEW BANNER */}
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-body text-emerald-200">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">💸</span>
                    <div>
                      <p className="font-bold text-white text-sm">Live Courier Earnings Allocation</p>
                      <p className="text-emerald-300/80">
                        Couriers will automatically earn <strong className="text-white underline">£{(deliverySettings.deliveryFeePence / 100).toFixed(2)}</strong> for every completed food delivery order.
                      </p>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl bg-amber-400 px-5 py-2.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition shrink-0 self-start sm:self-auto"
                  >
                    ✓ Save &amp; Apply Delivery Fee
                  </button>
                </div>
              </form>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Store Hours */}
                <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4 md:col-span-2">
                  <h3 className="display text-lg text-white font-bold">🕒 Daily Operating Hours</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                      const daily = storeSettings.weeklyHours?.[day] || { openTime: '11:00', closeTime: '22:00', isClosed: false }
                      return (
                        <div key={day} className="flex items-center justify-between gap-4 bg-white/5 p-3 rounded-2xl border border-white/5">
                          <div className="w-24 shrink-0 font-bold text-white/90">{day}</div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={daily.isClosed}
                              onChange={(e) => setStoreSettingsState(s => ({
                                ...s,
                                weeklyHours: {
                                  ...s.weeklyHours,
                                  [day]: { ...(s.weeklyHours?.[day] || daily), isClosed: e.target.checked }
                                }
                              }))}
                              className="h-4 w-4 rounded bg-white/10 border-white/20 text-amber-500 focus:ring-amber-500/50 cursor-pointer"
                            />
                            <span className="text-[10px] uppercase font-bold text-white/60">Closed</span>
                          </div>
                          {!daily.isClosed && (
                            <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                              <input
                                type="time"
                                value={daily.openTime}
                                onChange={(e) => setStoreSettingsState(s => ({
                                  ...s,
                                  weeklyHours: {
                                    ...s.weeklyHours,
                                    [day]: { ...(s.weeklyHours?.[day] || daily), openTime: e.target.value }
                                  }
                                }))}
                                className="w-full rounded-xl border border-white/20 bg-white/10 px-2 py-1.5 font-mono text-xs text-white text-center"
                              />
                              <span className="text-white/40 font-bold text-[10px]">to</span>
                              <input
                                type="time"
                                value={daily.closeTime}
                                onChange={(e) => setStoreSettingsState(s => ({
                                  ...s,
                                  weeklyHours: {
                                    ...s.weeklyHours,
                                    [day]: { ...(s.weeklyHours?.[day] || daily), closeTime: e.target.value }
                                  }
                                }))}
                                className="w-full rounded-xl border border-white/20 bg-white/10 px-2 py-1.5 font-mono text-xs text-white text-center"
                              />
                            </div>
                          )}
                          {daily.isClosed && (
                            <div className="flex-1 max-w-[200px] text-center py-1.5 text-[10px] text-red-400 font-bold uppercase tracking-wider bg-red-500/10 rounded-xl">
                              Closed All Day
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-white/50 leading-relaxed mt-2">
                    Store pickup and delivery cutoffs are automatically calculated (15m and 30m prior to closing, respectively).
                  </p>
                </div>

                {/* Announcement Banner */}
                <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
                  <h3 className="display text-lg text-white font-bold">📢 Top Announcement Banner</h3>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-white/60 mb-1">Banner Text</label>
                    <input
                      type="text"
                      value={storeSettings.announcementBanner.text}
                      onChange={(e) =>
                        setStoreSettingsState((s) => ({
                          ...s,
                          announcementBanner: { ...s.announcementBanner, text: e.target.value },
                        }))
                      }
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-body text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-2xl bg-amber-400 px-6 py-3 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition"
                >
                  ✓ Save Store Parameters
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 8: DRIVERS & FLEET OPERATIONS STUDIO                       */}
        {/* ============================================================== */}
        {activeTab === 'drivers' && (
          <div className="space-y-6">
            {/* Header & Action */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="display text-xl text-white font-bold flex items-center gap-2">
                  <span>🚚</span>
                  <span>Courier Fleet &amp; Live Dispatch Board</span>
                </h2>
                <p className="font-body text-xs text-white/60">
                  Manage Just Spuds couriers, online dispatch availability, PIN logins, and live delivery allocations.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={driverSearchQuery}
                  onChange={(e) => setDriverSearchQuery(e.target.value)}
                  placeholder="Search courier name, phone, plate..."
                  className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 font-body text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none w-full sm:w-64"
                />
                <button
                  type="button"
                  onClick={handleOpenAddDriver}
                  className="rounded-xl bg-amber-400 px-4 py-2 font-body text-xs font-black uppercase tracking-wider text-ink shadow hover:bg-amber-300 flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span>+</span>
                  <span>Register Courier</span>
                </button>
              </div>
            </div>

            {/* Fleet KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-body">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold text-white/50 block">Registered Fleet</span>
                <span className="display text-2xl text-white font-bold">{drivers.length} Couriers</span>
                <span className="text-[11px] text-white/40 block">Market Square Hub</span>
              </div>
              <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-300 block">Online Now</span>
                <span className="display text-2xl text-emerald-400 font-bold">{onlineDriversCount} Active</span>
                <span className="text-[11px] text-emerald-300/80 block">Ready to accept orders</span>
              </div>
              <div className="rounded-3xl border border-amber-400/30 bg-amber-400/10 p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold text-amber-300 block">Live Deliveries</span>
                <span className="display text-2xl text-amber-400 font-bold">{activeDeliveriesList.length} In Progress</span>
                <span className="text-[11px] text-amber-300/80 block">En route or preparing</span>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 space-y-1">
                <span className="text-[10px] uppercase font-bold text-white/50 block">Fleet Completed</span>
                <span className="display text-2xl text-white font-bold">
                  {orders.filter((o) => o.fulfilment === 'delivery' && o.status === 'delivered').length} Drops
                </span>
                <span className="text-[11px] text-white/40 block">Delivered safely</span>
              </div>
            </div>

            {/* LIVE ACTIVE DELIVERIES TABLE */}
            <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden shadow-2xl space-y-0">
              <div className="p-4 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">🛵</span>
                  <h3 className="font-body text-xs font-bold uppercase tracking-wider text-white">
                    Live Dispatch &amp; Active Runs ({activeDeliveriesList.length})
                  </h3>
                </div>
                <span className="text-[11px] text-amber-400 font-mono">● Real-Time Feed</span>
              </div>

              {activeDeliveriesList.length === 0 ? (
                <div className="p-6 text-center text-xs text-white/40 font-body">
                  No delivery orders currently on the road.
                </div>
              ) : (
                <table className="w-full text-left font-body text-xs">
                  <thead className="border-b border-white/10 bg-white/5 text-[10px] font-bold uppercase text-white/50">
                    <tr>
                      <th className="p-3.5">Order</th>
                      <th className="p-3.5">Customer &amp; Area</th>
                      <th className="p-3.5">Assigned Courier</th>
                      <th className="p-3.5">Delivery Status</th>
                      <th className="p-3.5">Delivery PIN</th>
                      <th className="p-3.5 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6">
                    {activeDeliveriesList.map((ord) => (
                      <tr key={ord.id} className="hover:bg-white/[0.02] transition">
                        <td className="p-3.5 font-mono font-bold text-amber-400">
                          #{ord.shortId}
                        </td>
                        <td className="p-3.5">
                          <p className="font-bold text-white">{ord.customer.name}</p>
                          <p className="text-[11px] text-white/50">{ord.customer.postcode || 'Aylesbury'}</p>
                        </td>
                        <td className="p-3.5">
                          {ord.deliveryDetails?.assignedDriverName || ord.driver?.name ? (
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-300 text-[11px]">
                                🛵 {ord.deliveryDetails?.assignedDriverName || ord.driver?.name}
                              </span>
                            </div>
                          ) : (
                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300 text-[11px] animate-pulse">
                              ⏳ Waiting for Courier Claim
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase text-white">
                            {ord.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono font-bold text-amber-300">
                          {ord.deliveryDetails?.deliveryPin || '4821'}
                        </td>
                        <td className="p-3.5 text-right font-bold text-white">
                          {gbp(ord.payment.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* DRIVER ACCOUNTS ROSTER */}
            <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                <h3 className="font-body text-xs font-bold uppercase tracking-wider text-white">
                  Fleet Roster &amp; Credentials ({drivers.length})
                </h3>
              </div>

              <table className="w-full text-left font-body text-xs">
                <thead className="border-b border-white/10 bg-white/5 text-[10px] font-bold uppercase text-white/50">
                  <tr>
                    <th className="p-4">Courier</th>
                    <th className="p-4">Vehicle &amp; Registration</th>
                    <th className="p-4">Contact</th>
                    <th className="p-4">Terminal PIN</th>
                    <th className="p-4">Live Availability</th>
                    <th className="p-4">Account Status</th>
                    <th className="p-4">Lifetime Drops</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {drivers
                    .filter((d) =>
                      d.name.toLowerCase().includes(driverSearchQuery.toLowerCase()) ||
                      d.vehicleReg.toLowerCase().includes(driverSearchQuery.toLowerCase()) ||
                      d.phone.includes(driverSearchQuery)
                    )
                    .map((drv) => (
                      <tr key={drv.id} className="hover:bg-white/[0.02] transition">
                        <td className="p-4 flex items-center gap-3">
                          <img
                            src={drv.avatar}
                            alt={drv.name}
                            className="h-9 w-9 rounded-xl border border-amber-400/40 object-cover"
                          />
                          <div>
                            <p className="font-bold text-white">{drv.name}</p>
                            <span className="text-[10px] text-amber-300 font-mono">
                              ★ {drv.rating} Rating
                            </span>
                          </div>
                        </td>

                        <td className="p-4">
                          <p className="font-bold text-white">{drv.vehicleType}</p>
                          <span className="font-mono text-[11px] text-amber-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
                            {drv.vehicleReg}
                          </span>
                        </td>

                        <td className="p-4">
                          <p className="font-mono text-white">{drv.phone}</p>
                          <p className="text-[11px] text-white/50">{drv.email}</p>
                        </td>

                        <td className="p-4 font-mono font-bold text-amber-300">
                          {drv.pin}
                        </td>

                        <td className="p-4">
                          <span
                            className={cx(
                              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider',
                              drv.isOnline
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-white/5 text-white/50 border border-white/10'
                            )}
                          >
                            <span className={cx('h-1.5 w-1.5 rounded-full', drv.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500')} />
                            {drv.isOnline ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </td>

                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => handleToggleDriverStatus(drv.id, drv.status)}
                            className={cx(
                              'rounded-lg px-2.5 py-1 text-[10px] font-black uppercase transition',
                              drv.status === 'ACTIVE'
                                ? 'bg-emerald-500/20 text-emerald-300 hover:bg-red-500/20 hover:text-red-300'
                                : 'bg-red-500/20 text-red-300 hover:bg-emerald-500/20 hover:text-emerald-300'
                            )}
                            title="Click to toggle between ACTIVE and SUSPENDED"
                          >
                            {drv.status} (Toggle)
                          </button>
                        </td>

                        <td className="p-4 font-mono font-bold text-white">
                          {drv.deliveriesCompletedCount} drops
                        </td>

                        <td className="p-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenEditDriver(drv)}
                            className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/15 transition"
                          >
                            ✏️ Edit Courier
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 9: STAFF ROSTER                                            */}
        {/* ============================================================== */}
        {activeTab === 'staff' && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="display text-xl text-white font-bold">Staff Roster &amp; Access Controls</h2>
                <p className="font-body text-xs text-white/60">Manage kitchen line cooks, drivers, and manager accounts.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.values(DEMO_USERS).map((u) => (
                <div key={u.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{u.name}</span>
                    <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[9px] font-black uppercase text-amber-300">
                      {u.role}
                    </span>
                  </div>
                  <p className="text-xs text-white/60">{u.email}</p>
                  <p className="text-[11px] text-white/40">{u.phone}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 9: AUDIT LOGS                                              */}
        {/* ============================================================== */}
        {activeTab === 'audit' && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="display text-xl text-white font-bold">Real-Time Operational Audit Trail</h2>
                <p className="font-body text-xs text-white/60">
                  Every manual status override, payment adjustment, PIN bypass, driver reassignment, and blacklist event is permanently recorded.
                </p>
              </div>
              <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-300 whitespace-nowrap self-start sm:self-auto">
                ● Live Events ({auditLogs.length})
              </span>
            </div>

            <div className="space-y-2 font-mono text-xs max-h-[600px] overflow-y-auto pr-1">
              {auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-amber-400 font-bold">
                      [{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
                    </span>
                    <strong className="text-white bg-white/10 px-2 py-0.5 rounded text-[11px]">{log.actor}</strong>
                    <span className="text-emerald-400 font-bold">➔ {log.action}</span>
                    <span className="text-amber-300 font-bold font-mono">({log.target})</span>
                    {log.details && (
                      <span className="text-white/60 text-[11px] truncate max-w-md">— {log.details}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/40 font-mono">{log.ip}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* PRODUCT ADD / EDIT MODAL */}
      <AdminProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSave={handleSaveProduct}
        initialProduct={editingProduct}
      />

      {/* COURIER DRIVER ADD / EDIT MODAL */}
      {isDriverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md font-body">
          <div className="w-full max-w-md rounded-3xl border border-white/20 bg-slate-900 p-6 sm:p-8 shadow-2xl space-y-5 text-white">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🛵</span>
                <h3 className="display text-lg text-white font-bold">
                  {editingDriver ? `Edit Courier: ${editingDriver.name}` : 'Register New Courier'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDriverModalOpen(false)}
                className="text-white/60 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveDriverSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase font-bold text-white/60 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jordan Miller"
                  value={driverFormName}
                  onChange={(e) => setDriverFormName(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase font-bold text-white/60 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    placeholder="07700 900..."
                    value={driverFormPhone}
                    onChange={(e) => setDriverFormPhone(e.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase font-bold text-white/60 mb-1">Terminal PIN</label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    placeholder="7780"
                    value={driverFormPin}
                    onChange={(e) => setDriverFormPin(e.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs font-mono font-bold text-amber-300 text-center placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase font-bold text-white/60 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="courier@justspuds.uk"
                  value={driverFormEmail}
                  onChange={(e) => setDriverFormEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase font-bold text-white/60 mb-1">Vehicle Type</label>
                  <select
                    value={driverFormVehicle}
                    onChange={(e) => setDriverFormVehicle(e.target.value as DriverProfile['vehicleType'])}
                    className="w-full rounded-xl border border-white/20 bg-slate-800 px-3 py-2.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  >
                    <option value="Electric Moped">Electric Moped</option>
                    <option value="Car">Car</option>
                    <option value="Motorcycle">Motorcycle</option>
                    <option value="E-Bike">Cargo E-Bike</option>
                    <option value="Van">Van</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] uppercase font-bold text-white/60 mb-1">Registration / Plate</label>
                  <input
                    type="text"
                    placeholder="AY24 SPD"
                    value={driverFormReg}
                    onChange={(e) => setDriverFormReg(e.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs font-mono uppercase text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsDriverModalOpen(false)}
                  className="flex-1 rounded-xl border border-white/20 bg-white/5 py-3 text-xs font-bold text-white/70 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-amber-400 py-3 text-xs font-black uppercase text-ink shadow hover:bg-amber-300 transition"
                >
                  {editingDriver ? 'Save Changes' : 'Create Courier'} &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* END-OF-DAY FINANCIAL Z-REPORT MODAL */}
      {isZReportOpen && zReportData && (
        <AdminZReportModal
          isOpen={isZReportOpen}
          onClose={() => setIsZReportOpen(false)}
          report={zReportData}
        />
      )}

      {/* THERMAL POS RECEIPT PREVIEW / PRINT MODAL */}
      {printingOrder && (
        <ThermalReceipt order={printingOrder} onClose={() => setPrintingOrder(null)} isModal={true} />
      )}

      {/* MANUAL ORDER PROBLEM FIXER MODAL */}
      {fixingOrder && (
        <ManualOrderFixModal
          order={fixingOrder}
          isOpen={true}
          onClose={() => setFixingOrder(null)}
          currentActorName={user?.name || 'Super Admin'}
          onOrderUpdated={(updated) => {
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
          }}
        />
      )}

      {/* CREATE MANUAL PHONE / COUNTER ORDER MODAL */}
      <CreateManualOrderModal
        isOpen={isCreateManualOrderOpen}
        onClose={() => setIsCreateManualOrderOpen(false)}
        currentActorName={user?.name || 'Super Admin'}
        onOrderCreated={(newOrder) => {
          setOrders((prev) => [newOrder, ...prev])
        }}
      />
    </div>
  )
}
