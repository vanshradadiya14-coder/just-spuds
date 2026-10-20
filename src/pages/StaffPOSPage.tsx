import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  getCurrentShift,
  openTillShift,
  recordTillSale,
  recordTillVoid,
  performNoSaleDrawerKick,
  subscribeShift,
  getTillSettings,
  subscribeTillSettings,
  getLastCompletedTillOrder,
  setLastCompletedTillOrder,
  type TillShift,
  type CashMovementKind,
} from '../services/tillStore'
import {
  subscribeOrders,
  updateOrderStatus,
  createManualCounterOrder,
  getOrderById,
  getOpenTillChecks,
  getOpenChecksDueToday,
  settleOpenOrder,
  voidOpenOrderLine,
  cancelOrder,
  recordReceiptDelivery,
  getMenuStockOverrides,
  subscribeStock,
  type Order,
  type PaymentMethod,
  type SplitTenderPortion,
} from '../services/orderStore'
import SaleCompleteModal from '../components/pos/SaleCompleteModal'
import TimeclockModal from '../components/pos/TimeclockModal'
import CustomerLookupModal, { type AttachedCustomer } from '../components/pos/CustomerLookupModal'
import ItemOptionsWizard, { stationFor } from '../components/pos/ItemOptionsWizard'
import PaymentScreen, { type PaymentTab, type Tender } from '../components/pos/PaymentScreen'
import OrdersScreen, { type OrdersTab } from '../components/pos/OrdersScreen'
import TillSideMenu, { type SideMenuAction } from '../components/pos/TillSideMenu'
import CashMovementModal from '../components/pos/CashMovementModal'
import StockModal from '../components/pos/StockModal'
import CloseTillScreen from '../components/pos/CloseTillScreen'
import EndOfDayReportModal from '../components/EndOfDayReportSlip'
import EndOfDayHistoryModal, { reportForShift } from '../components/EndOfDayHistory'
import { formatDuration, getActiveTimeclockEntry, isOnBreak, subscribeTimeclock, workedMs, type TimeclockEntry } from '../services/timeclockStore'
import {
  getCurrentUser,
  subscribeAuth,
  loginWithPin,
  logout,
  hasRole,
  verifyManagerPin,
  isManagerOrAdmin,
  SHOP_FLOOR_ROLES,
  type AuthUser,
} from '../services/authStore'
import { getProducts, subscribeMenu, getProductByBarcode, isListedInStore, isProductSoldOut, getCategories } from '../services/menuStore'
import { logAuditEvent } from '../services/auditStore'
import { extrasFor, MEAL_DEAL, type Product } from '../data/menu'
import { lineUnitPrice, type CartLine } from '../hooks/useCart'
import { gbp } from '../utils/format'
import { lineExtras, mealText, modifierText, saucesText } from '../utils/lineText'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { playPOSTouchTone } from '../services/printerBridge'
import TillSettingsModal from '../components/TillSettingsModal'
import { dismissOrderAlert, subscribeOrderAlerts, type OnlineOrderAlert } from '../services/alertSoundBus'
import { startOnlineOrderAlertWatcher } from '../services/orderAlerts'
import SyncStatusPill from '../components/SyncStatusPill'
import { computeVat, isVatRegistered } from '../services/vat'
import { broadcastCFDState, resetCFDState } from '../services/cfdBus'
import { getHeldTickets, holdTicket, subscribeHeldTickets, takeHeldTicket, type HeldTicket } from '../services/heldTickets'
import { buildEndOfDayReport, type EndOfDayReport } from '../services/endOfDayReport'
import ThermalReceipt from '../components/ThermalReceipt'
import FixedAmbientBackdrop from '../components/FixedAmbientBackdrop'
import FullscreenButton from '../components/FullscreenButton'
import InstallAppButton from '../components/InstallAppButton'

type OrderType = 'takeaway' | 'eat_in' | 'phone'

/** Categories whose dishes open the options pop-up (toppings, sauces, meal deal, leave-offs). */
const DISH_CATEGORIES = new Set(['SPUDS', 'BAGUETTES', 'PANINIS', 'WRAPS', 'RICE_BOXES', 'SALADS'])
const hasOptions = (p: Product) => DISH_CATEGORIES.has(p.category) || extrasFor(p).length > 0 || p.sauces || p.mealEligible

/** EPOS-style home tiles: one colour per category. */
const CATEGORY_TILE: Record<string, string> = {
  SPUDS: 'from-amber-500/35 to-amber-600/15 border-amber-400/50 text-amber-100',
  BAGUETTES: 'from-orange-500/35 to-orange-600/15 border-orange-400/50 text-orange-100',
  PANINIS: 'from-red-500/30 to-red-600/10 border-red-400/50 text-red-100',
  WRAPS: 'from-emerald-500/30 to-emerald-600/10 border-emerald-400/50 text-emerald-100',
  RICE_BOXES: 'from-indigo-500/35 to-indigo-600/15 border-indigo-400/50 text-indigo-100',
  SALADS: 'from-lime-500/30 to-lime-600/10 border-lime-400/50 text-lime-100',
  HOT_DRINKS: 'from-yellow-700/40 to-yellow-800/15 border-yellow-600/50 text-yellow-100',
  COLD_DRINKS: 'from-sky-500/35 to-sky-600/15 border-sky-400/50 text-sky-100',
  SNACKS: 'from-rose-500/30 to-rose-600/10 border-rose-400/50 text-rose-100',
}

const COMP_SUMMARY = (percent: number, reason: string) => (percent >= 100 ? `Comp — ${reason}` : `${percent}% — ${reason}`)

export default function StaffPOSPage() {
  useDocumentMeta({
    title: 'Food Store Till & POS Terminal',
    description: 'In-store food till with split payments, cash drawer, end-of-day report and thermal printer support.',
  })

  // Auth
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser())
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)

  // Shift & till settings
  const [shift, setShift] = useState<TillShift | null>(() => getCurrentShift())
  const [tillSettings, setSettings] = useState(() => getTillSettings())

  // Menu
  const [products, setProducts] = useState<Product[]>(() => getProducts())
  const [stockOverrides, setStockOverrides] = useState<Record<string, boolean>>(() => getMenuStockOverrides())
  const [browse, setBrowse] = useState<string>('HOME')
  const [searchQuery, setSearchQuery] = useState('')

  // Ticket
  const [cartLines, setCartLines] = useState<CartLine[]>([])
  const [customerName, setCustomerName] = useState('')
  const [buzzerNumber, setBuzzerNumber] = useState('')
  const [tableNumber, setTableNumber] = useState('')
  const [orderType, setOrderType] = useState<OrderType>('takeaway')
  const [discountPercent, setDiscountPercent] = useState(0)
  const [discountFixedPence, setDiscountFixedPence] = useState(0)
  const [discountReason, setDiscountReason] = useState('')
  const [tipPence, setTipPence] = useState(0)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [attachedCustomer, setAttachedCustomer] = useState<AttachedCustomer | null>(null)
  const [settlingOrder, setSettlingOrder] = useState<Order | null>(null)

  // Screens & pop-ups
  const [wizard, setWizard] = useState<{ product: Product; editLineId?: string } | null>(null)
  const [paying, setPaying] = useState<PaymentTab | null>(null)
  const [ordersTab, setOrdersTab] = useState<OrdersTab | null>(null)
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false)
  const [cashMovement, setCashMovement] = useState<CashMovementKind | null>(null)
  const [isStockOpen, setIsStockOpen] = useState(false)
  const [isCloseTillOpen, setIsCloseTillOpen] = useState(false)
  const [eodReport, setEodReport] = useState<{ report: EndOfDayReport; autoPrint: boolean } | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)
  const [isTipOpen, setIsTipOpen] = useState(false)
  const [isNoSaleModalOpen, setIsNoSaleModalOpen] = useState(false)
  const [isOnlineOrdersModalOpen, setIsOnlineOrdersModalOpen] = useState(false)
  const [isLineNoteModalOpen, setIsLineNoteModalOpen] = useState(false)
  const [isCustomItemModalOpen, setIsCustomItemModalOpen] = useState(false)
  const [isFastSearchOpen, setIsFastSearchOpen] = useState(false)
  const [fastSearchInput, setFastSearchInput] = useState('')
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isTicketSheetOpen, setIsTicketSheetOpen] = useState(false)
  const [isCustomerLookupOpen, setIsCustomerLookupOpen] = useState(false)
  const [isTimeclockOpen, setIsTimeclockOpen] = useState(false)
  const [priceOverrideLineId, setPriceOverrideLineId] = useState<string | null>(null)
  const [priceOverrideInput, setPriceOverrideInput] = useState('')
  const [lineVoidTarget, setLineVoidTarget] = useState<CartLine | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // Opening float
  const [startingFloatString, setStartingFloatString] = useState<string>(() => (getTillSettings().defaultFloatPence / 100).toFixed(2))
  const [hasManuallyEditedFloat, setHasManuallyEditedFloat] = useState(false)

  // Receipts & sale-complete
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null)
  const [lastOrder, setLastOrder] = useState<Order | null>(() => getLastCompletedTillOrder())
  const [saleComplete, setSaleComplete] = useState<{ order: Order; changeDuePence: number; tenderLabel: string } | null>(null)

  // Online order alerts
  const [activeAlerts, setActiveAlerts] = useState<OnlineOrderAlert[]>([])
  const seenAlertIds = useRef<Set<string>>(new Set())
  const [currentTime, setCurrentTime] = useState(new Date())

  // Manager PIN gate
  const [isManagerAuthModalOpen, setIsManagerAuthModalOpen] = useState(false)
  const [managerActionTitle, setManagerActionTitle] = useState('')
  const [managerActionDescription, setManagerActionDescription] = useState('')
  const [onManagerApproved, setOnManagerApproved] = useState<((mgrName: string) => void) | null>(null)
  const [managerPinInput, setManagerPinInput] = useState('')
  const [managerPinError, setManagerPinError] = useState<string | null>(null)

  // Orders, held tickets, staff clock, connectivity
  const [allOrdersList, setAllOrdersList] = useState<Order[]>([])
  const [openChecksCount, setOpenChecksCount] = useState(() => getOpenTillChecks().length)
  const [heldTickets, setHeldTickets] = useState<HeldTicket[]>(() => getHeldTickets())
  const [myClock, setMyClock] = useState<TimeclockEntry | undefined>(undefined)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  const actor = user?.name || 'Staff Cashier'
  const tillName = tillSettings.tillName || 'Till 1'

  // Subscriptions
  useEffect(() => {
    const unsubAuth = subscribeAuth((u) => setUser(u))
    const unsubShift = subscribeShift((s) => setShift(s))
    const unsubSettings = subscribeTillSettings((st) => setSettings(st))
    const unsubAlerts = subscribeOrderAlerts((a) => {
      // "Receipt when an online order arrives": pop the ticket for anything new, without accepting it.
      const fresh = a.find((alert) => !seenAlertIds.current.has(alert.orderId))
      a.forEach((alert) => seenAlertIds.current.add(alert.orderId))
      if (fresh && getTillSettings().autoPrintOnline) {
        const order = getOrderById(fresh.orderId)
        if (order) setReceiptOrder(order)
      }
      setActiveAlerts(a)
    })
    const unsubMenu = subscribeMenu(() => setProducts(getProducts()))
    const unsubStock = subscribeStock(setStockOverrides)
    const unsubHeld = subscribeHeldTickets(setHeldTickets)
    const unsubOrders = subscribeOrders((allOrders) => {
      setAllOrdersList(allOrders)
      setOpenChecksCount(getOpenTillChecks().length)
    })
    // New web orders → alert queue + alarm, shared with the KDS and admin.
    const stopAlertWatcher = startOnlineOrderAlertWatcher()
    const timer = setInterval(() => setCurrentTime(new Date()), 15_000)

    // USB/Bluetooth barcode scanner: fast keystrokes ending in Enter.
    let buffer = ''
    let lastKeyTime = 0
    const handleBarcodeKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const now = Date.now()
      if (now - lastKeyTime > 150) buffer = ''
      lastKeyTime = now
      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          e.preventDefault()
          const prod = getProductByBarcode(buffer)
          if (prod) handleItemClickRef.current(prod)
        }
        buffer = ''
      } else if (e.key.length === 1) {
        buffer += e.key
      }
    }
    window.addEventListener('keydown', handleBarcodeKey)

    return () => {
      unsubAuth()
      unsubShift()
      unsubSettings()
      unsubAlerts()
      unsubOrders()
      unsubMenu()
      unsubStock()
      unsubHeld()
      stopAlertWatcher()
      clearInterval(timer)
      window.removeEventListener('keydown', handleBarcodeKey)
    }
  }, [])

  const isAuthorized = hasRole(user, SHOP_FLOOR_ROLES)

  // Square / Toast behaviour: an idle register locks itself. Never mid-payment.
  const lastActivityRef = useRef(Date.now())
  const paymentInProgress = paying !== null
  useEffect(() => {
    const touch = () => {
      lastActivityRef.current = Date.now()
    }
    window.addEventListener('pointerdown', touch)
    window.addEventListener('keydown', touch)
    return () => {
      window.removeEventListener('pointerdown', touch)
      window.removeEventListener('keydown', touch)
    }
  }, [])
  useEffect(() => {
    const minutes = tillSettings.autoLockMinutes
    if (!isAuthorized || !minutes) return
    lastActivityRef.current = Date.now()
    const timer = setInterval(() => {
      if (paymentInProgress) return
      if (Date.now() - lastActivityRef.current >= minutes * 60_000) {
        logout()
        setPinError(`Till locked after ${minutes} min without use — enter your PIN to carry on. Your ticket is still here.`)
      }
    }, 10_000)
    return () => clearInterval(timer)
  }, [isAuthorized, tillSettings.autoLockMinutes, paymentInProgress])

  useEffect(() => {
    if (activeAlerts.length === 0) setIsOnlineOrdersModalOpen(false)
  }, [activeAlerts.length])

  useEffect(() => {
    if (!user) {
      setMyClock(undefined)
      return
    }
    return subscribeTimeclock(() => setMyClock(getActiveTimeclockEntry(user.id)))
  }, [user])

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(id)
  }, [flash])

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!pinInput.trim()) return
    const res = loginWithPin(pinInput)
    if (res.ok) {
      setPinInput('')
      setPinError(null)
    } else {
      setPinError(res.message)
    }
  }

  // ------------------------------------------------------------------ money
  const subtotalPence = useMemo(() => cartLines.reduce((acc, l) => acc + lineUnitPrice(l) * l.qty, 0), [cartLines])
  const discountPence = useMemo(() => {
    let disc = 0
    if (discountPercent > 0) disc += Math.round((subtotalPence * discountPercent) / 100)
    if (discountFixedPence > 0) disc += discountFixedPence
    return Math.min(disc, subtotalPence)
  }, [subtotalPence, discountPercent, discountFixedPence])
  // Tips are not VATable and sit on top of the discounted goods total.
  const totalDuePence = Math.max(0, subtotalPence - discountPence) + tipPence
  const vatIncludedPence = useMemo(
    () => computeVat({ lines: cartLines, discount: discountPence, eatIn: orderType === 'eat_in' }).vat,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartLines, discountPence, orderType, products],
  )
  const showVat = isVatRegistered()
  const itemCount = cartLines.reduce((n, l) => n + l.qty, 0)

  // Customer-facing display mirrors the ticket.
  useEffect(() => {
    broadcastCFDState({
      lines: cartLines,
      subtotalPence,
      discountPence,
      totalDuePence,
      orderType,
      customerName,
      buzzerNumber,
      tableNumber,
      status: paying ? 'tender' : cartLines.length > 0 ? 'ordering' : 'idle',
    })
  }, [cartLines, subtotalPence, discountPence, totalDuePence, orderType, customerName, buzzerNumber, tableNumber, paying])

  // -------------------------------------------------------------- keyboard
  // Ctrl+K or / search, F2 search, F4/F5 pay, F8 send to kitchen, F9 hold.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const typing = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA'
      if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && !typing)) {
        if (document.querySelector('[role="dialog"]')) return
        e.preventDefault()
        setIsFastSearchOpen(true)
        return
      }
      if (!e.key.startsWith('F') || e.ctrlKey || e.altKey || e.metaKey) return
      if (document.querySelector('[role="dialog"]') || paying) return
      const actions: Record<string, () => void> = {
        F2: () => setIsFastSearchOpen(true),
        F4: () => openPayment('payment'),
        F5: () => openPayment('payment'),
        F8: () => handleSendToKitchen(),
        F9: () => handleHoldTicket(),
      }
      const action = actions[e.key]
      if (!action) return
      e.preventDefault()
      action()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  // ----------------------------------------------------------- manager PIN
  const requireManagerAuth = (title: string, desc: string, onSuccess: (mgrName: string) => void) => {
    if (isManagerOrAdmin(user?.role)) {
      onSuccess(user?.name || 'Authorized Manager')
      logAuditEvent(user?.name || 'Manager', 'manager.override', title, desc)
      return
    }
    setManagerActionTitle(title)
    setManagerActionDescription(desc)
    setManagerPinInput('')
    setManagerPinError(null)
    setOnManagerApproved(() => (mgrName: string) => {
      onSuccess(mgrName)
      logAuditEvent(mgrName, 'manager.override', title, `${desc} (Approved for cashier ${user?.name || 'Staff'})`)
      setIsManagerAuthModalOpen(false)
    })
    setIsManagerAuthModalOpen(true)
  }

  // ----------------------------------------------------------------- items
  const isSoldOut = (p: Product) => isProductSoldOut(p, stockOverrides)

  const addSimpleItem = (product: Product) => {
    playPOSTouchTone('tap')
    // Same plain item again (a second Coke) just bumps the quantity, like EPOS.
    const existing = cartLines.find(
      (l) =>
        l.productId === product.id &&
        l.extras.length === 0 &&
        l.sauces.length === 0 &&
        !l.meal &&
        !l.notes &&
        !l.conversationalModifiers?.length &&
        typeof l.priceOverridePence !== 'number' &&
        !settlingOrder?.lines.some((sent) => sent.lineId === l.lineId),
    )
    if (existing) {
      setCartLines((prev) => prev.map((l) => (l.lineId === existing.lineId ? { ...l, qty: l.qty + 1 } : l)))
      setSelectedLineId(existing.lineId)
      return
    }
    const lineId = `${product.id}-${Date.now()}`
    setCartLines((prev) => [
      ...prev,
      {
        lineId,
        productId: product.id,
        name: product.name,
        base: product.price,
        extras: [],
        sauces: [],
        meal: false,
        image: product.image,
        category: product.category,
        qty: 1,
        station: stationFor(product.category),
      },
    ])
    setSelectedLineId(lineId)
  }

  const handleItemClick = (product: Product) => {
    if (isSoldOut(product)) {
      setFlash(`${product.name} is sold out`)
      return
    }
    if (paying) return
    if (hasOptions(product)) {
      playPOSTouchTone('tap')
      setWizard({ product })
    } else {
      addSimpleItem(product)
    }
  }
  const handleItemClickRef = useRef(handleItemClick)
  handleItemClickRef.current = handleItemClick

  const handleWizardConfirm = (line: Omit<CartLine, 'lineId'>) => {
    const editId = wizard?.editLineId
    if (editId) {
      setCartLines((prev) => prev.map((l) => (l.lineId === editId ? { ...line, lineId: editId } : l)))
      setSelectedLineId(editId)
    } else {
      const lineId = `${line.productId}-${Date.now()}`
      setCartLines((prev) => [...prev, { ...line, lineId }])
      setSelectedLineId(lineId)
    }
    setWizard(null)
  }

  const isSentLine = (lineId: string) => Boolean(settlingOrder?.lines.some((l) => l.lineId === lineId))

  const handleUpdateLineQty = (lineId: string, delta: number) => {
    playPOSTouchTone('numpad')
    // Never below 1 here: taking an item off goes through Delete (logged as a void).
    setCartLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, qty: Math.max(1, l.qty + delta) } : l)))
  }

  const handleDeleteSelectedLine = () => {
    if (!selectedLineId) return
    const line = cartLines.find((l) => l.lineId === selectedLineId)
    if (!line) return
    if (isSentLine(line.lineId)) {
      setLineVoidTarget(line)
      return
    }
    const lineDesc = `${line.qty}x ${line.name}`
    requireManagerAuth('Delete item', `Remove ${lineDesc} from the ticket`, (mgrName) => {
      playPOSTouchTone('action')
      setCartLines((prev) => prev.filter((l) => l.lineId !== line.lineId))
      setSelectedLineId(null)
      recordTillVoid({ kind: 'line', staff: actor, approvedBy: mgrName, item: lineDesc, qty: line.qty, value: lineUnitPrice(line) * line.qty, reason: 'Removed before payment' })
      logAuditEvent(mgrName, 'pos.void_line', lineDesc, `Line removed by ${mgrName}`)
    })
  }

  /** Every path that ends a ticket funnels through here so nothing is left over for the next customer. */
  const resetTicket = () => {
    setIsTicketSheetOpen(false)
    setPaying(null)
    setCartLines([])
    setCustomerName('')
    setAttachedCustomer(null)
    setBuzzerNumber('')
    setTableNumber('')
    setDiscountPercent(0)
    setDiscountFixedPence(0)
    setDiscountReason('')
    setTipPence(0)
    setSelectedLineId(null)
    setSettlingOrder(null)
    setOrderType('takeaway')
    resetCFDState()
  }

  const handleVoidTicket = () => {
    if (cartLines.length === 0) return
    if (settlingOrder) {
      const check = settlingOrder
      requireManagerAuth('Void open order', `Void #${check.shortId} (${gbp(check.payment.total)}) — sent to kitchen, never paid`, (mgrName) => {
        const res = cancelOrder(check.id, `Till void by ${mgrName}`)
        if (res.ok) {
          recordTillVoid({
            kind: 'check',
            staff: actor,
            approvedBy: mgrName,
            item: `#${check.shortId}: ${check.lines.map((l) => `${l.qty}x ${l.name}`).join(', ')}`,
            qty: check.lines.reduce((n, l) => n + l.qty, 0),
            value: check.payment.total,
            reason: 'Voided at the till',
            orderShortId: check.shortId,
          })
        }
        resetTicket()
        setFlash(res.ok ? `#${check.shortId} voided` : res.message)
      })
      return
    }
    requireManagerAuth('Delete ticket', `Clear the whole ticket (${itemCount} items, ${gbp(subtotalPence)})`, (mgrName) => {
      playPOSTouchTone('action')
      recordTillVoid({
        kind: 'ticket',
        staff: actor,
        approvedBy: mgrName,
        item: cartLines.map((l) => `${l.qty}x ${l.name}`).join(', '),
        qty: itemCount,
        value: subtotalPence,
        reason: 'Ticket cleared before payment',
      })
      logAuditEvent(mgrName, 'pos.void_ticket', 'Entire Ticket Voided', `Ticket cleared with ${cartLines.length} items totaling ${gbp(subtotalPence)}`)
      resetTicket()
    })
  }

  const handleHoldTicket = () => {
    if (cartLines.length === 0 || settlingOrder) return
    playPOSTouchTone('action')
    holdTicket({
      customer: customerName.trim() || `Customer ${heldTickets.length + 1}`,
      lines: cartLines,
      type: orderType,
      heldBy: actor,
      buzzer: buzzerNumber.trim() || undefined,
      table: tableNumber.trim() || undefined,
      discountPercent: discountPercent || undefined,
      discountFixedPence: discountFixedPence || undefined,
    })
    resetTicket()
    setFlash('Ticket held — recall it from Orders › Held')
  }

  /** Clears the way for something else to be loaded: an unsent ticket is held, not lost. */
  const parkCurrentTicket = () => {
    if (cartLines.length > 0 && !settlingOrder) handleHoldTicket()
    else if (settlingOrder) resetTicket()
  }

  const handleRecallHeld = (ticket: HeldTicket) => {
    parkCurrentTicket()
    const taken = takeHeldTicket(ticket.id)
    if (!taken) {
      setFlash('That ticket was already recalled on another tab.')
      return
    }
    playPOSTouchTone('action')
    setCartLines(taken.lines)
    setCustomerName(taken.customer)
    setBuzzerNumber(taken.buzzer || '')
    setTableNumber(taken.table || '')
    setOrderType(taken.type)
    setDiscountPercent(taken.discountPercent || 0)
    setDiscountFixedPence(taken.discountFixedPence || 0)
    setOrdersTab(null)
  }

  /** Load an unpaid order (open check, or a website order paid on collection) and go straight to payment. */
  const handleSettleOpenCheck = (order: Order) => {
    parkCurrentTicket()
    playPOSTouchTone('action')
    setCartLines(order.lines)
    setCustomerName(order.customer.name)
    setBuzzerNumber(order.customer.buzzerNumber || '')
    setTableNumber(order.customer.tableNumber || '')
    setDiscountPercent(0)
    setDiscountFixedPence(order.payment.discount || 0)
    setDiscountReason(order.payment.promoCode || '')
    setTipPence(order.payment.tip || 0)
    setSelectedLineId(null)
    setOrderType(order.source === 'PHONE' ? 'phone' : /EAT[_ ]IN/i.test(order.kitchenNotes || '') ? 'eat_in' : 'takeaway')
    setSettlingOrder(order)
    setOrdersTab(null)
    setPaying('payment')
  }

  /** Void a line that was already fired to the kitchen: reason + manager, stock goes back. */
  const handleVoidOpenCheckLine = (line: CartLine, reason: string) => {
    if (!settlingOrder) return
    requireManagerAuth('Void sent item', `${line.qty}x ${line.name} on #${settlingOrder.shortId} — ${reason}`, (mgrName) => {
      const pending = cartLines.filter((l) => !settlingOrder.lines.some((sent) => sent.lineId === l.lineId))
      const res = voidOpenOrderLine(settlingOrder.id, line.lineId, reason, mgrName, pending)
      if (!res.ok || !res.order) {
        setFlash(res.message)
        setLineVoidTarget(null)
        return
      }
      recordTillVoid({
        kind: 'line',
        staff: actor,
        approvedBy: mgrName,
        item: `${line.qty}x ${line.name}`,
        qty: line.qty,
        value: lineUnitPrice(line) * line.qty,
        reason,
        orderShortId: settlingOrder.shortId,
      })
      setSettlingOrder(res.order)
      setCartLines((prev) => prev.filter((l) => l.lineId !== line.lineId))
      setSelectedLineId(null)
      setLineVoidTarget(null)
      setFlash(`Voided ${line.name} — ${reason}`)
    })
  }

  /** Manager price override on one line (Square "edit price"). */
  const handleApplyPriceOverride = () => {
    const lineId = priceOverrideLineId
    const pence = Math.round((parseFloat(priceOverrideInput) || 0) * 100)
    if (!lineId || pence < 0) return
    const line = cartLines.find((l) => l.lineId === lineId)
    if (!line) return
    requireManagerAuth('Price Override', `${line.name}: ${gbp(lineUnitPrice(line))} → ${gbp(pence)}`, (mgrName) => {
      setCartLines((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, priceOverridePence: pence, priceOverrideReason: `Override by ${mgrName}` } : l)))
      logAuditEvent(mgrName, 'pos.price_override', line.name, `${gbp(lineUnitPrice(line))} -> ${gbp(pence)}`)
      setPriceOverrideLineId(null)
      setPriceOverrideInput('')
    })
  }

  const handleAttachCustomer = (c: AttachedCustomer) => {
    playPOSTouchTone('tap')
    setAttachedCustomer(c)
    setCustomerName(c.name)
    setIsCustomerLookupOpen(false)
  }

  const handleAddCustomLineItem = (name: string, pricePence: number, station: 'spuds' | 'grill' | 'drinks') => {
    playPOSTouchTone('action')
    const lineId = `custom-${Date.now()}`
    setCartLines((prev) => [
      ...prev,
      {
        lineId,
        productId: lineId,
        name: name.trim() || 'Misc item',
        base: pricePence,
        meal: false,
        extras: [],
        sauces: [],
        image: '',
        category: 'CUSTOM',
        qty: 1,
        station,
        notes: 'Misc item',
      },
    ])
    setSelectedLineId(lineId)
    setIsCustomItemModalOpen(false)
  }

  // ------------------------------------------------------------- discounts
  const handleApplyComp = (percent: number, reason: string) => {
    const apply = (by: string) => {
      playPOSTouchTone('comp')
      if (percent >= 100) {
        setDiscountPercent(0)
        setDiscountFixedPence(subtotalPence)
      } else {
        setDiscountFixedPence(0)
        setDiscountPercent(percent)
      }
      setDiscountReason(COMP_SUMMARY(percent, reason))
      logAuditEvent(by, 'pos.discount', `${percent}% Discount Applied`, `Reason: ${reason}`)
    }
    if (percent > 20) requireManagerAuth('Discount', `${percent}% off ${gbp(subtotalPence)} — ${reason}`, apply)
    else apply(actor)
  }

  const handleClearDiscount = () => {
    playPOSTouchTone('action')
    setDiscountPercent(0)
    setDiscountFixedPence(0)
    setDiscountReason('')
  }

  // ------------------------------------------------------- send / payment
  const orderNotes = (extra?: string) =>
    [
      // "TILL: …" keeps a renamed till out of the kitchen's allergen box (utils/kitchenNotes).
      `[TILL: ${tillName}] ${orderType.toUpperCase()}`,
      extra,
      `Cashier: ${actor}`,
      buzzerNumber ? `Buzzer #${buzzerNumber}` : null,
      tableNumber ? `Table #${tableNumber}` : null,
      discountPence > 0 && discountReason ? `Discount: ${discountReason}` : null,
    ]
      .filter(Boolean)
      .join(' • ')

  /**
   * Toast "Send" / EPOS "Order": fire the ticket to the kitchen now, take payment
   * on collection. It waits in Orders › Open until settled or voided.
   */
  const handleSendToKitchen = () => {
    if (cartLines.length === 0 || settlingOrder) return
    playPOSTouchTone('action')
    const sent = createManualCounterOrder(
      {
        customerName: customerName.trim() || (orderType === 'eat_in' ? 'Dine In Customer' : 'Counter Takeaway'),
        customerPhone: attachedCustomer?.phone || '01296 423456',
        customerEmail: attachedCustomer?.email,
        fulfilment: 'pickup',
        lines: cartLines,
        paymentMethod: 'in_store',
        paymentStatus: 'pending_store',
        discount: discountPence,
        buzzerNumber: buzzerNumber.trim() || undefined,
        tableNumber: tableNumber.trim() || undefined,
        notes: orderNotes('OPEN CHECK'),
        source: orderType === 'phone' ? 'PHONE' : 'TILL',
      },
      actor,
    )
    if (tillSettings.autoPrintTillReceipt) setReceiptOrder(sent)
    resetTicket()
    setFlash(`Sent #${sent.shortId} to the kitchen — take payment from Orders › Open`)
  }

  const openPayment = (tab: PaymentTab = 'payment') => {
    if (cartLines.length === 0) return
    playPOSTouchTone('tap')
    setIsTicketSheetOpen(false)
    setPaying(tab)
  }

  /** Common tail for every completed sale: last-order memory, CFD, receipt, and the sale-complete screen. */
  const finishSale = (order: Order, changeDue: number, tenderLabel: string) => {
    setLastCompletedTillOrder(order)
    setLastOrder(order)
    broadcastCFDState({ status: 'paid', completedOrderShortId: order.shortId, changeDuePence: changeDue, tenderMethod: tenderLabel })
    if (tillSettings.autoPrintTillReceipt) {
      recordReceiptDelivery(order.id, 'print', undefined, actor)
      setReceiptOrder(order)
    }
    resetTicket()
    setSaleComplete({ order, changeDuePence: changeDue, tenderLabel })
  }

  const completePayment = (tenders: Tender[], changeDue: number) => {
    if (cartLines.length === 0) return
    const cash = tenders.filter((t) => t.method === 'cash').reduce((n, t) => n + t.amount, 0)
    const card = tenders.filter((t) => t.method === 'card').reduce((n, t) => n + t.amount, 0)
    const other = tenders.filter((t) => t.method === 'other').reduce((n, t) => n + t.amount, 0)
    const single = tenders.length === 1 && tenders[0].method !== 'other'
    const paymentMethod: PaymentMethod = tenders.length === 0 ? 'complimentary' : single ? (tenders[0].method as 'cash' | 'card') : 'split'
    const now = new Date().toISOString()
    const splitDetails: SplitTenderPortion[] | undefined =
      paymentMethod === 'split' ? tenders.map((t) => ({ method: t.method === 'other' ? 'online' : t.method, amount: t.amount, paidAt: now })) : undefined

    const order = settlingOrder
      ? settleOpenOrder(settlingOrder.id, { lines: cartLines, discount: discountPence, tip: tipPence, paymentMethod, splitDetails, actor })
      : createManualCounterOrder(
          {
            customerName: customerName.trim() || (orderType === 'eat_in' ? 'Dine In Customer' : 'Counter Takeaway'),
            customerPhone: attachedCustomer?.phone || '01296 423456',
            customerEmail: attachedCustomer?.email,
            fulfilment: 'pickup',
            lines: cartLines,
            paymentMethod,
            paymentStatus: 'paid',
            discount: discountPence,
            tip: tipPence,
            buzzerNumber: buzzerNumber.trim() || undefined,
            tableNumber: tableNumber.trim() || undefined,
            notes: orderNotes(),
            splitDetails,
            source: orderType === 'phone' ? 'PHONE' : 'TILL',
          },
          actor,
        )
    if (!order) {
      setFlash('That order has already been paid on another till.')
      resetTicket()
      return
    }

    recordTillSale({
      paymentMethod: paymentMethod === 'cash' || paymentMethod === 'card' ? paymentMethod : 'split',
      totalPence: cash + card + other,
      discountPence: discountPence > 0 ? discountPence : undefined,
      orderId: order.shortId,
      orderUuid: order.id,
      staffName: actor,
      splitCashPence: cash,
      splitCardPence: card,
      splitOnlinePence: other,
      tipPence,
    })

    const label =
      tenders.length === 0 ? '🎁 No charge' : single ? (tenders[0].method === 'cash' ? '💵 Cash' : '💳 Card') : `🔀 ${[cash && 'Cash', card && 'Card', other && 'Link'].filter(Boolean).join(' + ')}`
    finishSale(order, changeDue, label)
  }

  /** Split by item: the ticked lines stay on this bill, the rest becomes a held ticket. */
  const handleSplitItems = (keepIds: string[]) => {
    const keep = cartLines.filter((l) => keepIds.includes(l.lineId))
    const rest = cartLines.filter((l) => !keepIds.includes(l.lineId))
    if (keep.length === 0 || rest.length === 0) return
    holdTicket({
      customer: `${customerName.trim() || 'Guest'} — rest of bill`,
      lines: rest,
      type: orderType,
      heldBy: actor,
      buzzer: buzzerNumber.trim() || undefined,
      table: tableNumber.trim() || undefined,
    })
    setCartLines(keep)
    setFlash(`${rest.reduce((n, l) => n + l.qty, 0)} item(s) moved to Held for the next guest`)
  }

  // ------------------------------------------------------------- reports
  const buildLiveReport = (s: TillShift) =>
    buildEndOfDayReport({ shift: s, orders: allOrdersList, products, categories: getCategories(), vatRegistered: isVatRegistered(), kind: 'X' })

  const handleSideMenu = (action: SideMenuAction) => {
    setIsSideMenuOpen(false)
    switch (action) {
      case 'float':
      case 'petty':
      case 'tip_out':
        setCashMovement(action)
        break
      case 'no_sale':
        requireManagerAuth('No sale', 'Open the cash drawer without a sale', () => setIsNoSaleModalOpen(true))
        break
      case 'x_read':
        if (shift) setEodReport({ report: buildLiveReport(shift), autoPrint: false })
        break
      case 'close_till':
        if (cartLines.length > 0 && !settlingOrder) handleHoldTicket()
        setIsCloseTillOpen(true)
        break
      case 'history':
        setIsHistoryOpen(true)
        break
      case 'stock':
        setIsStockOpen(true)
        break
      case 'orders':
        setOrdersTab('complete')
        break
      case 'reprint':
        if (lastOrder) setReceiptOrder(lastOrder)
        break
      case 'timeclock':
        setIsTimeclockOpen(true)
        break
      case 'cfd':
        window.open('/cfd', 'JustSpudsCFD', 'width=1024,height=650')
        break
      case 'settings':
        requireManagerAuth('Till settings', 'Till name, printer, drawer, sounds and float defaults', () => setIsSettingsModalOpen(true))
        break
      case 'shortcuts':
        setIsShortcutsOpen(true)
        break
      case 'lock':
        logout()
        break
    }
  }

  /** The unpaid ticket as a customer bill (EPOS "Print"). */
  const printBill = () => {
    if (cartLines.length === 0) return
    const now = new Date().toISOString()
    setReceiptOrder({
      id: settlingOrder?.id || 'bill-preview',
      shortId: settlingOrder?.shortId || 'BILL',
      source: orderType === 'phone' ? 'PHONE' : 'TILL',
      createdAt: now,
      status: 'accepted',
      fulfilment: 'pickup',
      customer: { name: customerName.trim() || 'Counter customer', phone: attachedCustomer?.phone || '', email: '', buzzerNumber: buzzerNumber || undefined, tableNumber: tableNumber || undefined },
      lines: cartLines,
      payment: { method: 'in_store', status: 'pending_store', subtotal: subtotalPence, deliveryFee: 0, serviceFee: 0, tip: tipPence, discount: discountPence, total: totalDuePence },
      estimatedDeliveryTime: '',
      etaMinutes: 0,
      timeline: [],
    })
  }

  // ------------------------------------------------------------ menu view
  const favouriteIds = useMemo(() => {
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000
    const sold = new Map<string, number>()
    for (const o of allOrdersList) {
      if (o.status === 'cancelled' || new Date(o.createdAt).getTime() < since) continue
      for (const l of o.lines) sold.set(l.productId, (sold.get(l.productId) || 0) + l.qty)
    }
    const top = [...sold.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id)
    return new Set([...products.filter((p) => p.popular).map((p) => p.id), ...top])
  }, [allOrdersList, products])

  const storeProducts = useMemo(() => products.filter(isListedInStore), [products])
  const categories = useMemo(() => getCategories().filter((c) => storeProducts.some((p) => p.category === c.id)), [storeProducts])
  const browseLabel = browse === 'FAVOURITES' ? 'Favourites' : categories.find((c) => c.id === browse)?.label || ''

  const visibleProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (q) return storeProducts.filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.barcode === q)
    if (browse === 'HOME') return []
    if (browse === 'FAVOURITES') return storeProducts.filter((p) => favouriteIds.has(p.id))
    return storeProducts.filter((p) => p.category === browse)
  }, [storeProducts, browse, searchQuery, favouriteIds])

  // ------------------------------------------------------------------ float
  const handleFloatNumpadPress = (val: string) => {
    playPOSTouchTone('tap')
    if (!hasManuallyEditedFloat) {
      setHasManuallyEditedFloat(true)
      setStartingFloatString(val === '.' ? '0.' : val)
      return
    }
    if (val === '.') {
      if (startingFloatString.includes('.')) return
      setStartingFloatString((prev) => (prev ? `${prev}.` : '0.'))
      return
    }
    if (startingFloatString.includes('.')) {
      const parts = startingFloatString.split('.')
      if (parts[1] && parts[1].length >= 2) return
    }
    if (startingFloatString.replace('.', '').length >= 6) return
    setStartingFloatString((prev) => (prev === '0' ? val : `${prev}${val}`))
  }
  const handleFloatBackspace = () => {
    playPOSTouchTone('tap')
    setHasManuallyEditedFloat(true)
    setStartingFloatString((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)))
  }
  const handleFloatSetPreset = (amount: number) => {
    playPOSTouchTone('tap')
    setHasManuallyEditedFloat(true)
    setStartingFloatString(amount.toFixed(2))
  }
  const handleOpenShift = () => {
    playPOSTouchTone('action')
    const parsed = parseFloat(startingFloatString)
    const floatVal = isNaN(parsed) || parsed < 0 ? 0 : parsed
    openTillShift(actor, Math.round(floatVal * 100))
  }

  const reportModals = (
    <>
      {eodReport && <EndOfDayReportModal report={eodReport.report} autoPrint={eodReport.autoPrint} onClose={() => setEodReport(null)} />}
      {isHistoryOpen && <EndOfDayHistoryModal onClose={() => setIsHistoryOpen(false)} />}
    </>
  )

  // ======================================================== PIN gate
  if (!isAuthorized) {
    return (
      <div className="relative min-h-screen bg-portal-dark text-slate-100 flex flex-col items-center justify-center p-4 select-none overflow-hidden">
        <FixedAmbientBackdrop variant="portal" />
        <div className="pointer-events-none absolute h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-amber-500/20 via-emerald-500/10 to-transparent blur-[120px]" />

        <div className="relative z-10 mb-6 flex items-center gap-3">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 font-body text-xs font-bold text-white hover:bg-white/15 transition backdrop-blur-md">
            <span>←</span>
            <span>Customer Website</span>
          </Link>
          <Link to="/staff" className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 font-body text-xs font-bold text-amber-300 hover:bg-amber-400 hover:text-ink transition backdrop-blur-md">
            <span>👨‍🍳</span>
            <span>Kitchen KDS</span>
          </Link>
          <FullscreenButton showLabel className="rounded-full px-4 py-2 backdrop-blur-md" />
        </div>

        <div className="relative z-10 w-full max-w-sm rounded-3xl border border-amber-400/40 bg-slate-900/90 backdrop-blur-xl p-8 shadow-2xl text-center ring-1 ring-amber-400/20">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-amber-400 text-3xl shadow-glow text-ink">🥔</div>
          <h1 className="display text-2xl text-white font-bold tracking-tight">{tillName}</h1>
          <p className="font-body text-xs text-white/60 mt-1 mb-6">Enter your staff PIN to use the till.</p>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <input
              type="password"
              maxLength={8}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••"
              autoFocus
              className="w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-center font-mono text-3xl tracking-[0.5em] text-white focus:border-amber-400 focus:outline-none"
            />
            <div className="grid grid-cols-3 gap-2 pt-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    playPOSTouchTone('numpad')
                    setPinInput((prev) => (prev.length < 8 ? prev + num : prev))
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 py-3.5 font-mono text-xl font-bold text-white hover:bg-white/15 transition active:scale-95"
                >
                  {num}
                </button>
              ))}
              <button type="button" onClick={() => setPinInput('')} className="rounded-xl border border-red-500/20 bg-red-950/20 py-3 font-body text-xs font-bold text-red-400 hover:bg-red-900/40">
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  playPOSTouchTone('numpad')
                  setPinInput((prev) => (prev.length < 8 ? prev + '0' : prev))
                }}
                className="rounded-xl border border-white/10 bg-white/5 py-3 font-mono text-xl font-bold text-white hover:bg-white/15"
              >
                0
              </button>
              <button type="button" onClick={() => setPinInput((prev) => prev.slice(0, -1))} className="rounded-xl border border-white/10 bg-white/5 py-3 font-body text-xs font-bold text-white hover:bg-white/15" aria-label="Delete digit">
                ⌫
              </button>
            </div>
            {pinError && <p className="rounded-xl bg-red-950/50 border border-red-500/40 p-2.5 font-body text-xs text-red-300">{pinError}</p>}
            <button type="submit" className="w-full rounded-full bg-amber-400 py-3.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition">
              Sign in →
            </button>
          </form>

          <button type="button" onClick={() => setIsTimeclockOpen(true)} className="mt-4 w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-xs font-bold text-white/80 hover:bg-white/15 transition">
            ⏱️ Clock in / out only (no till access)
          </button>
        </div>
        {isTimeclockOpen && <TimeclockModal onClose={() => setIsTimeclockOpen(false)} />}
      </div>
    )
  }

  // ======================================================== Opening float gate
  if (!shift || shift.status === 'closed') {
    const parsedFloat = parseFloat(startingFloatString)
    const floatVal = isNaN(parsedFloat) || parsedFloat < 0 ? 0 : parsedFloat
    return (
      <div className="relative min-h-screen bg-portal-dark text-slate-100 flex flex-col items-center justify-center p-3 sm:p-4 select-none overflow-hidden">
        <FixedAmbientBackdrop variant="portal" />
        <div className="pointer-events-none absolute h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-amber-500/20 via-emerald-500/10 to-transparent blur-[120px]" />

        <div className="relative z-10 w-full max-w-md rounded-3xl border border-amber-400/40 bg-slate-900/90 backdrop-blur-xl p-5 sm:p-6 shadow-2xl text-center space-y-4 ring-1 ring-amber-400/20">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/20 border border-amber-400/40 text-3xl">🔒</div>
          <div>
            <h1 className="display text-2xl font-black text-white tracking-wide">Open the till</h1>
            <p className="font-body text-xs text-white/60 mt-0.5">
              <strong className="text-amber-400">{tillName}</strong> &bull; {user?.name}
            </p>
          </div>

          <div className="space-y-2.5 text-left bg-black/50 border border-white/10 rounded-2xl p-3.5">
            <label className="block text-xs font-black uppercase tracking-wider text-amber-300" htmlFor="opening-float">
              Opening float (cash in the drawer)
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-2xl font-black text-amber-400">£</span>
              <input
                id="opening-float"
                type="text"
                inputMode="decimal"
                value={startingFloatString}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                    setStartingFloatString(val)
                    setHasManuallyEditedFloat(true)
                  }
                }}
                placeholder="0.00"
                className="w-full rounded-xl border-2 border-amber-400/50 bg-white/10 pl-9 pr-3 py-2 font-mono text-2xl font-black text-white focus:border-amber-400 focus:outline-none text-right"
              />
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[0, 30, 50, 100, 150].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleFloatSetPreset(preset)}
                  className={`rounded-xl py-1.5 font-mono text-xs font-bold border transition ${floatVal === preset ? 'bg-amber-400 text-ink border-amber-400 font-black' : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/15'}`}
                >
                  £{preset}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-white/10">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map((digit) => (
                <button key={digit} type="button" onClick={() => handleFloatNumpadPress(digit)} className="h-10 rounded-xl bg-white/10 border border-white/15 font-mono text-lg font-black text-white hover:bg-white/20 active:scale-95 transition">
                  {digit}
                </button>
              ))}
              <button type="button" onClick={handleFloatBackspace} className="h-10 rounded-xl bg-red-950/40 border border-red-500/30 font-mono text-base font-black text-red-300 hover:bg-red-900/50 active:scale-95 transition" aria-label="Delete digit">
                ⌫
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenShift}
            className="w-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500 py-3.5 font-body text-sm font-black uppercase tracking-wider text-ink shadow-glow hover:from-amber-300 hover:to-amber-400 transition active:scale-95"
          >
            🔓 {floatVal === 0 ? 'Open with no float' : `Open with £${floatVal.toFixed(2)} float`}
          </button>

          <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-white/10 text-xs">
            <button type="button" onClick={() => setIsHistoryOpen(true)} className="text-amber-300 hover:underline">
              🗂️ Past end-of-day reports
            </button>
            <Link to="/staff" className="text-amber-300 hover:underline">
              Kitchen screen →
            </Link>
            <button type="button" onClick={logout} className="text-red-400 hover:underline">
              Lock
            </button>
          </div>
        </div>
        {reportModals}
      </div>
    )
  }

  // ======================================================== Till
  const ticketTitle = settlingOrder ? `#${settlingOrder.shortId} • ${settlingOrder.customer.name}` : customerName.trim() || (orderType === 'eat_in' ? 'Eat in' : orderType === 'phone' ? 'Phone order' : 'Takeaway')

  const ticketPanel = (
    <aside
      className={`${isTicketSheetOpen ? 'flex' : 'hidden'} lg:flex fixed inset-0 z-40 lg:static lg:inset-auto lg:z-auto w-full lg:w-96 xl:w-[420px] bg-slate-900 lg:border-l border-white/10 flex-col shrink-0 shadow-2xl overflow-y-auto overscroll-contain`}
      aria-label="Till ticket"
    >
      <div className="lg:hidden flex items-center justify-between border-b border-white/10 bg-black/60 px-3 py-2 shrink-0">
        <span className="text-xs font-black uppercase tracking-wider text-white/70">Ticket</span>
        <button type="button" onClick={() => setIsTicketSheetOpen(false)} className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white">
          ← Back to menu
        </button>
      </div>

      {/* Order type, buzzer, table, customer */}
      <div className="p-2.5 border-b border-white/10 bg-black/40 space-y-2 shrink-0">
        <div className="flex rounded-xl bg-white/5 p-1 border border-white/10 text-xs">
          {([
            ['takeaway', '🛍️ Takeaway'],
            ['eat_in', '🍽️ Eat in'],
            ['phone', '📞 Phone'],
          ] as [OrderType, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              disabled={paying !== null}
              onClick={() => setOrderType(id)}
              className={`flex-1 px-2 py-1.5 rounded-lg font-black whitespace-nowrap transition disabled:opacity-60 ${orderType === id ? 'bg-amber-400 text-ink' : 'text-white/60 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-12 gap-1.5">
          <input
            type="text"
            value={buzzerNumber}
            onChange={(e) => setBuzzerNumber(e.target.value)}
            placeholder="🔔 Buzzer"
            className="col-span-3 rounded-xl border border-white/10 bg-black/60 px-2 py-1.5 font-mono text-xs font-black text-amber-300 placeholder-white/30 focus:border-amber-400 focus:outline-none"
            aria-label="Buzzer number"
          />
          <input
            type="text"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="🪑 Table"
            className="col-span-3 rounded-xl border border-white/10 bg-black/60 px-2 py-1.5 font-mono text-xs font-black text-indigo-300 placeholder-white/30 focus:border-indigo-400 focus:outline-none"
            aria-label="Table number"
          />
          <div className="col-span-6 flex gap-1">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/60 px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:border-amber-400 focus:outline-none"
              aria-label="Customer name"
            />
            <button
              type="button"
              onClick={() => setIsCustomerLookupOpen(true)}
              className={`shrink-0 rounded-xl border px-2 text-xs font-bold transition ${attachedCustomer ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/15'}`}
              title={attachedCustomer ? `${attachedCustomer.phone} • ${attachedCustomer.visits} visits` : 'Find a customer by phone'}
              aria-label="Find customer"
            >
              👤
            </button>
          </div>
        </div>
        {attachedCustomer && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px]">
            <span className="text-emerald-200 truncate">
              <span className="font-mono">{attachedCustomer.phone}</span> &bull; {attachedCustomer.visits} {attachedCustomer.visits === 1 ? 'visit' : 'visits'} &bull; {gbp(attachedCustomer.lifetimeSpendPence)} spent
            </span>
            <button type="button" onClick={() => setAttachedCustomer(null)} className="text-white/50 hover:text-white" aria-label="Remove customer">
              ✕
            </button>
          </div>
        )}
        {settlingOrder && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px]">
            <span className="text-amber-200">
              Paying for <span className="font-mono font-black">#{settlingOrder.shortId}</span>
              {settlingOrder.source === 'WEBSITE' ? ' (website order)' : ''} — taking a sent item off needs a void reason.
            </span>
            <button type="button" onClick={resetTicket} className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 font-bold text-white/70 hover:bg-white/15">
              Put back
            </button>
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="flex-1 min-h-[7rem] p-2.5 overflow-y-auto space-y-1.5 bg-black/20">
        {cartLines.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40">
            <span className="text-4xl mb-2">🧾</span>
            <p className="font-body text-xs font-black uppercase tracking-wider">Add a dish or drink</p>
            <p className="font-body text-[11px] text-white/50 mt-0.5">Tap a product to add it to the bill</p>
          </div>
        ) : (
          cartLines.map((line) => {
            const isSelected = selectedLineId === line.lineId
            const sent = isSentLine(line.lineId)
            const product = products.find((p) => p.id === line.productId)
            const editable = !sent && !paying && product && hasOptions(product) && typeof line.priceOverridePence !== 'number'
            return (
              <div
                key={line.lineId}
                onClick={() => setSelectedLineId(isSelected ? null : line.lineId)}
                className={`rounded-xl border p-2 text-xs transition cursor-pointer ${isSelected ? 'border-amber-400 bg-amber-400/10 shadow' : 'border-white/10 bg-black/40 hover:border-white/20'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-black text-white text-[13px] leading-tight">
                    {line.qty}× {line.name}
                    {sent && <span className="ml-1.5 rounded bg-white/10 px-1 py-0.5 align-middle text-[9px] font-bold text-white/50">SENT</span>}
                  </div>
                  <span className="font-mono font-bold text-amber-300 shrink-0">{gbp(lineUnitPrice(line) * line.qty)}</span>
                </div>
                {line.conversationalModifiers && line.conversationalModifiers.length > 0 && (
                  <div className="pl-3 flex flex-wrap gap-1 mt-1">
                    {line.conversationalModifiers.map((mod, idx) => (
                      <span key={idx} className={`px-1.5 py-0.5 text-[9px] rounded font-bold uppercase tracking-tight ${mod.type === 'no' ? 'bg-rose-500/20 text-rose-200' : 'bg-white/10 text-white/80'}`}>
                        {modifierText(mod)}
                      </span>
                    ))}
                  </div>
                )}
                {lineExtras(line).map((x) => (
                  <p key={x.id} className="pl-3 text-[11px] text-white/75 flex justify-between gap-2">
                    <span>
                      + {x.count > 1 ? `${x.count}× ` : ''}
                      {x.label}
                    </span>
                    <span className="font-mono text-white/50">{gbp(x.unit * x.count)}</span>
                  </p>
                ))}
                {line.sauces.length > 0 && <p className="pl-3 text-[11px] text-amber-200/80">Sauce: {saucesText(line)}</p>}
                {line.meal && (
                  <p className="pl-3 text-[11px] font-bold text-emerald-300 flex justify-between gap-2">
                    <span>+ Meal: {mealText(line)}</span>
                    <span className="font-mono text-white/50">{gbp(MEAL_DEAL.price)}</span>
                  </p>
                )}
                {line.notes && <p className="pl-3 text-[11px] italic text-rose-200">* {line.notes}</p>}
                {typeof line.priceOverridePence === 'number' && <p className="pl-3 text-[11px] font-bold text-sky-300">Price changed to {gbp(line.priceOverridePence)}</p>}

                {isSelected && !paying && (
                  <div className="mt-2 pt-1.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={sent} onClick={() => handleUpdateLineQty(line.lineId, -1)} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white font-bold hover:bg-white/20 disabled:opacity-30" aria-label="One fewer">
                        −
                      </button>
                      <span className="font-mono text-sm font-bold text-white w-6 text-center">{line.qty}</span>
                      <button type="button" disabled={sent} onClick={() => handleUpdateLineQty(line.lineId, 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white font-bold hover:bg-white/20 disabled:opacity-30" aria-label="One more">
                        +
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {editable && (
                        <button type="button" onClick={() => setWizard({ product: product!, editLineId: line.lineId })} className="rounded-lg px-2 py-1.5 text-[11px] font-bold bg-white/10 text-white/85 hover:bg-white/20">
                          ✎ Edit
                        </button>
                      )}
                      <button type="button" disabled={sent} onClick={() => setIsLineNoteModalOpen(true)} className="rounded-lg px-2 py-1.5 text-[11px] font-bold bg-white/10 text-white/85 hover:bg-white/20 disabled:opacity-30">
                        Note
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPriceOverrideLineId(line.lineId)
                          setPriceOverrideInput((lineUnitPrice(line) / 100).toFixed(2))
                        }}
                        className="rounded-lg px-2 py-1.5 text-[11px] font-bold bg-white/10 text-white/85 hover:bg-white/20"
                        title="Change the price (manager PIN)"
                      >
                        £ Price
                      </button>
                      <button type="button" onClick={handleDeleteSelectedLine} className="rounded-lg px-2 py-1.5 text-[11px] font-bold bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900">
                        {sent ? 'Void' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Totals (EPOS: items, discount / total, due, tax) */}
      <div className="p-2.5 border-t border-white/10 bg-black/60 space-y-1 text-xs shrink-0">
        <div className="flex justify-between text-white/70 text-[11px]">
          <span>Items: {itemCount} &bull; Subtotal</span>
          <span className="font-mono font-bold">{gbp(subtotalPence)}</span>
        </div>
        {discountPence > 0 && (
          <div className="flex justify-between font-bold text-amber-300 text-[11px] gap-2">
            <span className="truncate">Discount{discountReason ? ` (${discountReason})` : ''}</span>
            <span className="font-mono shrink-0">
              −{gbp(discountPence)}
              {!paying && (
                <button type="button" onClick={handleClearDiscount} className="ml-1 text-white/40 hover:text-white" aria-label="Remove discount">
                  ✕
                </button>
              )}
            </span>
          </div>
        )}
        {tipPence > 0 && (
          <div className="flex justify-between font-bold text-emerald-300 text-[11px]">
            <span>Gratuity</span>
            <span className="font-mono">
              +{gbp(tipPence)}
              {!paying && (
                <button type="button" onClick={() => setTipPence(0)} className="ml-1 text-white/40 hover:text-white" aria-label="Remove gratuity">
                  ✕
                </button>
              )}
            </span>
          </div>
        )}
        {showVat && (
          <div className="flex justify-between text-white/40 text-[10px]">
            <span>VAT included{orderType === 'eat_in' ? ' (eat in)' : ''}</span>
            <span className="font-mono">{gbp(vatIncludedPence)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline pt-1 border-t border-white/15">
          <span className="font-black text-sm text-white uppercase tracking-wider">Total</span>
          <span className="font-mono text-2xl font-black text-amber-400">{gbp(totalDuePence)}</span>
        </div>
      </div>

      {/* EPOS function keys + Delete / Order / Pay */}
      <div className="p-2 border-t border-white/10 bg-slate-950 space-y-1.5 shrink-0">
        {!paying && (
          <div className="grid grid-cols-4 gap-1.5 text-[10px] font-bold uppercase tracking-wide">
            {(
              [
                { icon: '➕', label: 'Misc item', run: () => setIsCustomItemModalOpen(true) },
                { icon: '🖨️', label: 'Print bill', run: printBill, needsLines: true },
                { icon: '⏸️', label: 'Hold', run: handleHoldTicket, needsLines: true, disabled: !!settlingOrder },
                { icon: '🔓', label: 'No sale', run: () => requireManagerAuth('No sale', 'Open the cash drawer without a sale', () => setIsNoSaleModalOpen(true)) },
                { icon: '🏷️', label: 'Discount', run: () => openPayment('discount'), needsLines: true },
                { icon: '💝', label: 'Gratuity', run: () => setIsTipOpen(true), needsLines: true },
                { icon: '🧾', label: 'Petty cash', run: () => setCashMovement('petty') },
                { icon: '💷', label: 'Adjust float', run: () => setCashMovement('float') },
              ] as { icon: string; label: string; run: () => void; needsLines?: boolean; disabled?: boolean }[]
            ).map((k) => (
              <button
                key={k.label}
                type="button"
                disabled={k.disabled || (k.needsLines && cartLines.length === 0)}
                onClick={() => {
                  playPOSTouchTone('tap')
                  k.run()
                }}
                className="flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-white/10 bg-white/5 px-1 py-1.5 text-white/80 hover:bg-white/10 active:scale-95 disabled:opacity-30"
              >
                <span className="text-sm" aria-hidden>{k.icon}</span>
                <span className="leading-tight text-center">{k.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-[1fr_1.2fr_1.5fr] gap-1.5">
          <button
            type="button"
            disabled={cartLines.length === 0 || paying !== null}
            onClick={handleVoidTicket}
            className="rounded-xl border border-rose-500/50 bg-rose-950/30 py-3.5 text-xs font-black uppercase tracking-wider text-rose-300 hover:bg-rose-900/50 disabled:opacity-30"
          >
            Delete
          </button>
          <button
            type="button"
            disabled={cartLines.length === 0 || !!settlingOrder || paying !== null}
            onClick={handleSendToKitchen}
            className="rounded-xl border border-orange-400/60 bg-orange-500/15 py-3.5 text-xs font-black uppercase tracking-wider text-orange-200 hover:bg-orange-500/25 disabled:opacity-30"
            title="Send to the kitchen now, take payment on collection (F8)"
          >
            Order
          </button>
          <button
            type="button"
            disabled={cartLines.length === 0 || paying !== null}
            onClick={() => openPayment('payment')}
            className="rounded-xl bg-blue-500 py-3.5 text-sm font-black uppercase tracking-wider text-white shadow-glow hover:bg-blue-400 disabled:opacity-30"
            title="Take payment (F4)"
          >
            Pay {cartLines.length > 0 ? gbp(totalDuePence) : ''}
          </button>
        </div>
        {lastOrder && !paying && (
          <button type="button" onClick={() => setReceiptOrder(lastOrder)} className="w-full pt-0.5 text-center text-[11px] font-bold text-amber-300/90 hover:underline">
            🖨️ Reprint last receipt (#{lastOrder.shortId})
          </button>
        )}
      </div>
    </aside>
  )

  return (
    // 100dvh, not 100vh: on iPad/phone browsers 100vh runs under the toolbar and hid the Pay row.
    <div className="relative h-screen supports-[height:100dvh]:h-dvh w-full bg-portal-dark text-slate-100 flex flex-col overflow-hidden select-none font-body">
      <FixedAmbientBackdrop variant="portal" />

      {/* Top bar: menu, till, status, orders */}
      <header className="h-14 border-b border-white/10 bg-slate-900 px-2 sm:px-3 flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setIsSideMenuOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5 text-lg text-white hover:bg-white/15"
            aria-label="Till menu"
            aria-haspopup="dialog"
          >
            ☰
          </button>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-mono text-xs font-black tracking-wider text-white">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
              {tillName.toUpperCase()}
            </p>
            <p className="hidden truncate text-[10px] text-white/50 sm:block">
              {user?.name} • Shift #{shift.shiftNumber} • {currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto scrollbar-none [&>*]:shrink-0 py-1">
          {isOnline ? (
            <SyncStatusPill compact />
          ) : (
            <span className="inline-flex bg-rose-950/60 border border-rose-500/40 text-rose-300 items-center gap-1.5 rounded-xl px-2 py-1 text-[10px] font-bold" title="Offline — sales are saved on this till and upload when the connection returns">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
              OFFLINE
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsTimeclockOpen(true)}
            className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold transition flex items-center gap-1 ${
              myClock ? (isOnBreak(myClock) ? 'border-amber-400/40 bg-amber-500/10 text-amber-300' : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300') : 'border-white/20 bg-white/10 text-white/70 hover:bg-white/20'
            }`}
            title="Time clock"
            aria-label="Time clock"
          >
            <span>⏱️</span>
            <span className="hidden xl:inline font-mono">{myClock ? (isOnBreak(myClock) ? 'On break' : formatDuration(workedMs(myClock))) : 'Clock in'}</span>
          </button>
          {activeAlerts.length > 0 && (
            <button type="button" onClick={() => setIsOnlineOrdersModalOpen(true)} className="rounded-xl bg-rose-600 px-3 py-1.5 font-body text-xs font-black text-white shadow-glow hover:bg-rose-500 transition animate-bounce flex items-center gap-1.5">
              <span>🚨</span>
              <span>
                {activeAlerts.length} new online order{activeAlerts.length > 1 ? 's' : ''}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setOrdersTab(openChecksCount > 0 ? 'open' : heldTickets.length > 0 ? 'held' : 'complete')}
            className={`rounded-xl border px-2.5 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${openChecksCount + heldTickets.length > 0 ? 'border-amber-400/60 bg-amber-500/15 text-amber-200' : 'border-white/20 bg-white/10 text-white/80 hover:bg-white/20'}`}
            title="Held, open and completed orders — receipts and refunds"
          >
            <span>📋</span>
            <span>Orders</span>
            {openChecksCount + heldTickets.length > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 font-mono text-[10px] font-black text-ink">{openChecksCount + heldTickets.length}</span>
            )}
          </button>
          <Link to="/staff" className="rounded-xl bg-amber-400 px-3 py-1.5 font-body text-xs font-black text-ink shadow hover:bg-amber-300 transition flex items-center gap-1" aria-label="Kitchen display">
            <span>👨‍🍳</span>
            <span className="hidden sm:inline">KDS</span>
          </Link>
          <InstallAppButton />
          <FullscreenButton />
          <button type="button" onClick={logout} className="rounded-xl border border-red-500/20 bg-red-950/30 p-1.5 text-red-400 hover:bg-red-900/50" title="Lock till" aria-label="Lock till">
            🔒
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Products — or, while paying, the payment screen in their place (EPOS) */}
        {paying ? (
          <PaymentScreen
            key={settlingOrder?.id || 'ticket'}
            className="fixed inset-0 z-[45] lg:static lg:z-auto flex-1"
            initialTab={paying}
            title={ticketTitle}
            subtotalPence={subtotalPence}
            discountPence={discountPence}
            discountLabel={discountReason}
            tipPence={tipPence}
            vatPence={vatIncludedPence}
            showVat={showVat}
            lines={cartLines}
            tipPromptEnabled={tillSettings.tipPrompt}
            splitItemsDisabledReason={settlingOrder ? 'This order was already sent to the kitchen as one ticket — split it by guest instead.' : undefined}
            onSetTip={setTipPence}
            onApplyComp={handleApplyComp}
            onClearDiscount={handleClearDiscount}
            onSplitItems={handleSplitItems}
            onComplete={completePayment}
            onClose={() => setPaying(null)}
          />
        ) : (
          <section className="flex-1 flex flex-col min-w-0 bg-slate-950">
            {/* Breadcrumb + search (EPOS: HOME › JUST SPUDS) */}
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-slate-900/60 px-2.5 py-2">
              <nav className="flex min-w-0 items-center gap-1.5 text-xs font-black uppercase tracking-wider" aria-label="Menu path">
                <button
                  type="button"
                  onClick={() => {
                    setBrowse('HOME')
                    setSearchQuery('')
                  }}
                  className={`rounded-lg px-2.5 py-1.5 ${browse === 'HOME' && !searchQuery ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
                >
                  Home
                </button>
                {(browse !== 'HOME' || searchQuery) && (
                  <>
                    <span className="text-white/30" aria-hidden>
                      ›
                    </span>
                    <span className="truncate text-amber-300">{searchQuery ? `“${searchQuery}”` : browseLabel}</span>
                  </>
                )}
              </nav>
              <div className="ml-auto flex min-w-[10rem] flex-1 items-center gap-1.5 sm:flex-none sm:w-64">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="🔍 Search the menu"
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white placeholder-white/40 focus:border-amber-400 focus:outline-none"
                  aria-label="Search the menu"
                />
                <button type="button" onClick={() => setIsBarcodeModalOpen(true)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-sm hover:bg-white/15" title="Barcode / SKU" aria-label="Barcode or SKU">
                  📟
                </button>
              </div>
            </div>

            {/* Quick category strip — one tap between categories */}
            <div className="flex shrink-0 gap-1.5 overflow-x-auto scrollbar-none px-2.5 py-2 [&>button]:shrink-0">
              {[{ id: 'FAVOURITES', label: '★ Favourites' }, ...categories].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setBrowse(c.id)
                    setSearchQuery('')
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition ${
                    browse === c.id && !searchQuery ? 'border-amber-300 bg-amber-400 text-ink' : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-2.5 pb-24 lg:pb-3">
              {browse === 'HOME' && !searchQuery ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
                  {[{ id: 'FAVOURITES', label: '★ Favourites' }, ...categories].map((c) => {
                    const count = c.id === 'FAVOURITES' ? storeProducts.filter((p) => favouriteIds.has(p.id)).length : storeProducts.filter((p) => p.category === c.id).length
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          playPOSTouchTone('tap')
                          setBrowse(c.id)
                        }}
                        className={`flex min-h-[96px] flex-col justify-between rounded-2xl border bg-gradient-to-br p-3 text-left shadow-md transition hover:brightness-125 active:scale-95 ${
                          CATEGORY_TILE[c.id] || 'from-white/15 to-white/5 border-white/20 text-white'
                        }`}
                      >
                        <span className="text-sm font-black uppercase tracking-wider leading-tight">{c.label}</span>
                        <span className="text-[11px] font-bold opacity-70">
                          {count} item{count === 1 ? '' : 's'}
                        </span>
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setIsCustomItemModalOpen(true)}
                    className="flex min-h-[96px] flex-col justify-between rounded-2xl border border-dashed border-purple-400/50 bg-purple-500/10 p-3 text-left text-purple-100 hover:bg-purple-500/20 active:scale-95"
                  >
                    <span className="text-sm font-black uppercase tracking-wider">➕ Misc item</span>
                    <span className="text-[11px] font-bold opacity-70">Any name, any price</span>
                  </button>
                </div>
              ) : visibleProducts.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-xs text-white/45">{searchQuery ? 'Nothing on the menu matches that.' : 'No items in this category yet.'}</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5 auto-rows-max content-start">
                  {visibleProducts.map((prod) => {
                    const soldOut = isSoldOut(prod)
                    const low = !soldOut && typeof prod.stockQuantity === 'number' && prod.stockQuantity <= (prod.lowStockThreshold ?? 5)
                    return (
                      <button
                        key={prod.id}
                        type="button"
                        disabled={soldOut}
                        onClick={() => handleItemClick(prod)}
                        className={`relative flex min-h-[96px] flex-col justify-between rounded-2xl border p-3 text-left shadow-md transition ${
                          soldOut ? 'cursor-not-allowed border-red-500/20 bg-slate-900/40 opacity-55' : 'border-white/15 bg-slate-900 hover:border-amber-400 hover:bg-slate-800 active:scale-95'
                        }`}
                      >
                        <span className={`line-clamp-2 text-[13px] font-black leading-tight ${soldOut ? 'text-white/50' : 'text-white'}`}>{prod.name}</span>
                        <span className="mt-2 flex items-end justify-between gap-1">
                          <span className="font-mono text-sm font-black text-amber-300">{gbp(prod.price)}</span>
                          {soldOut ? (
                            <span className="rounded bg-red-950/90 border border-red-500/60 px-1.5 text-[9px] font-black text-red-300">SOLD OUT</span>
                          ) : low ? (
                            <span className="rounded bg-amber-500/20 border border-amber-400/50 px-1.5 text-[9px] font-bold text-amber-300">{prod.stockQuantity} left</span>
                          ) : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Tablet / phone: total bar that opens the ticket sheet */}
        {!isTicketSheetOpen && !paying && (
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-900/95 backdrop-blur px-3 py-2 flex items-center gap-2 shadow-2xl">
            <button type="button" onClick={() => setIsTicketSheetOpen(true)} className="flex-1 flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-left" aria-label="View ticket">
              <span className="text-xs font-bold text-white">
                🧾 {itemCount} item{itemCount === 1 ? '' : 's'}
                {settlingOrder && <span className="ml-1 text-amber-300">• #{settlingOrder.shortId}</span>}
              </span>
              <span className="font-mono text-lg font-black text-amber-300">{gbp(totalDuePence)}</span>
            </button>
            <button type="button" onClick={() => openPayment('payment')} disabled={cartLines.length === 0} className="rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-glow disabled:opacity-40">
              Pay
            </button>
          </div>
        )}

        {ticketPanel}
      </div>

      {flash && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-[70] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-emerald-400/40 bg-slate-900/95 px-4 py-2 text-center text-xs font-bold text-emerald-300 shadow-2xl backdrop-blur lg:bottom-5" role="status">
          {flash}
        </div>
      )}

      {/* ---------------------------------------------------- screens & pop-ups */}
      {wizard && <ItemOptionsWizard product={wizard.product} initial={wizard.editLineId ? cartLines.find((l) => l.lineId === wizard.editLineId) : undefined} onClose={() => setWizard(null)} onConfirm={handleWizardConfirm} />}

      {ordersTab && (
        <OrdersScreen
          initialTab={ordersTab}
          actor={actor}
          onClose={() => setOrdersTab(null)}
          onRecallHeld={handleRecallHeld}
          onSettle={handleSettleOpenCheck}
          onReprint={(o) => setReceiptOrder(o)}
          requireManagerAuth={requireManagerAuth}
          onFlash={setFlash}
        />
      )}

      {isSideMenuOpen && (
        <TillSideMenu
          tillName={tillName}
          userName={actor}
          shiftNumber={shift.shiftNumber}
          floatPence={shift.startingFloat}
          canReprint={Boolean(lastOrder)}
          isManager={isManagerOrAdmin(user?.role)}
          onAction={handleSideMenu}
          onClose={() => setIsSideMenuOpen(false)}
        />
      )}

      {cashMovement && <CashMovementModal kind={cashMovement} staffName={actor} onClose={() => setCashMovement(null)} onDone={setFlash} />}

      {isStockOpen && <StockModal onClose={() => setIsStockOpen(false)} actor={actor} requireManagerAuth={requireManagerAuth} />}

      {isCloseTillOpen && (
        <CloseTillScreen
          shift={shift}
          userName={actor}
          blindClose={tillSettings.blindShiftClose}
          heldCount={heldTickets.length}
          openChecksDue={getOpenChecksDueToday()}
          onBack={() => setIsCloseTillOpen(false)}
          onOpenOrders={(tab) => setOrdersTab(tab)}
          onShowReport={(report) => setEodReport({ report, autoPrint: false })}
          onShowHistory={() => setIsHistoryOpen(true)}
          onClosed={(closed) => {
            setIsCloseTillOpen(false)
            setEodReport({ report: closed.report || reportForShift(closed), autoPrint: true })
          }}
        />
      )}

      {reportModals}

      {isShortcutsOpen && (
        <SimpleDialog title="Keyboard shortcuts" onClose={() => setIsShortcutsOpen(false)}>
          <ul className="space-y-1.5 text-sm">
            {[
              ['F4 / F5', 'Take payment'],
              ['F8', 'Order — send to the kitchen, pay later'],
              ['F9', 'Hold the ticket'],
              ['F2, / or Ctrl+K', 'Search the menu'],
              ['Enter (payment)', 'Cash for the amount shown'],
              ['Esc', 'Back / close'],
            ].map(([k, v]) => (
              <li key={k} className="flex justify-between gap-3">
                <span className="font-mono text-amber-300">{k}</span>
                <span className="text-white/75 text-right">{v}</span>
              </li>
            ))}
          </ul>
        </SimpleDialog>
      )}

      {isTipOpen && (
        <TipDialog
          current={tipPence}
          onClose={() => setIsTipOpen(false)}
          onSet={(p) => {
            setTipPence(p)
            setIsTipOpen(false)
          }}
        />
      )}

      {isNoSaleModalOpen && (
        <SimpleDialog title="🔓 No sale — open drawer" onClose={() => setIsNoSaleModalOpen(false)}>
          <p className="text-xs text-white/60">Why is the drawer being opened?</p>
          <div className="mt-3 space-y-2">
            {['Making change for a customer', 'Checking the float', 'Coin refill from the safe', 'Manager check'].map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => {
                  performNoSaleDrawerKick(actor, reason)
                  setIsNoSaleModalOpen(false)
                  setFlash(`Drawer opened — ${reason}`)
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left text-xs font-bold text-white hover:bg-amber-400 hover:text-ink transition"
              >
                {reason}
              </button>
            ))}
          </div>
        </SimpleDialog>
      )}

      {isSettingsModalOpen && <TillSettingsModal onClose={() => setIsSettingsModalOpen(false)} actor={actor} />}

      {saleComplete && (
        <SaleCompleteModal
          order={saleComplete.order}
          changeDuePence={saleComplete.changeDuePence}
          tenderLabel={saleComplete.tenderLabel}
          actor={actor}
          autoPrinted={tillSettings.autoPrintTillReceipt}
          onPrint={(o) => setReceiptOrder(o)}
          onNewSale={() => {
            setSaleComplete(null)
            if (tillSettings.lockAfterSale) {
              logout()
              setPinError('Sale complete — next person, enter your PIN.')
            }
          }}
        />
      )}

      {isTimeclockOpen && <TimeclockModal onClose={() => setIsTimeclockOpen(false)} user={user} />}
      {isCustomerLookupOpen && <CustomerLookupModal onClose={() => setIsCustomerLookupOpen(false)} onAttach={handleAttachCustomer} />}

      {priceOverrideLineId && (
        <div className="fixed inset-0 z-50 flex items-center [align-items:safe_center] justify-center overflow-y-auto p-4 bg-black/85 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Change price">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleApplyPriceOverride()
            }}
            className="w-full max-w-xs rounded-3xl border border-sky-400/40 bg-slate-900 p-5 shadow-2xl space-y-3 text-white font-body"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="font-bold text-sm">£ Change price</h3>
              <button type="button" onClick={() => setPriceOverrideLineId(null)} className="text-white/60 hover:text-white" aria-label="Close">
                ✕
              </button>
            </div>
            <p className="text-[11px] text-white/60">New price each for {cartLines.find((l) => l.lineId === priceOverrideLineId)?.name}. Manager PIN required.</p>
            <div className="flex items-center gap-2 font-mono">
              <span className="text-white/60">£</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={0.05}
                autoFocus
                value={priceOverrideInput}
                onChange={(e) => setPriceOverrideInput(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-right text-xl text-white focus:border-sky-400 focus:outline-none"
              />
            </div>
            <button type="submit" className="w-full rounded-xl bg-sky-400 py-2.5 text-xs font-black uppercase tracking-wider text-ink hover:bg-sky-300">
              Apply →
            </button>
          </form>
        </div>
      )}

      {lineVoidTarget && (
        <SimpleDialog title="Void sent item" onClose={() => setLineVoidTarget(null)}>
          <p className="text-[11px] text-white/60">
            {lineVoidTarget.qty}× {lineVoidTarget.name} has already gone to the kitchen. Pick a reason — a manager PIN confirms it and stock is returned.
          </p>
          <div className="mt-3 space-y-1.5">
            {['Customer changed mind', 'Wrong item rung up', 'Kitchen unable to make', 'Quality issue / remake', 'Duplicate line'].map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => handleVoidOpenCheckLine(lineVoidTarget, reason)}
                className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-left text-xs font-bold text-white hover:bg-rose-400 hover:text-ink transition"
              >
                {reason}
              </button>
            ))}
          </div>
        </SimpleDialog>
      )}

      {isOnlineOrdersModalOpen && (
        <SimpleDialog title="🚨 New online orders" onClose={() => setIsOnlineOrdersModalOpen(false)} wide>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {activeAlerts.map((alert) => (
              <div key={alert.orderId} className="rounded-2xl border border-white/10 bg-black/40 p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="rounded-md bg-amber-400 px-1.5 py-0.5 font-mono text-[10px] font-black text-ink">#{alert.shortId}</span>
                  <p className="font-bold text-xs text-white mt-1">
                    {alert.customerName} ({gbp(alert.total)})
                  </p>
                  <p className="text-[10px] text-white/60">{alert.itemsSummary}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const accepted = updateOrderStatus(alert.orderId, 'accepted')
                      dismissOrderAlert(alert.orderId)
                      if (accepted) setReceiptOrder(accepted)
                    }}
                    className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-ink hover:bg-emerald-400 shadow"
                  >
                    🖨️ Accept &amp; print
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissOrderAlert(alert.orderId)}
                    className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-xs text-white/60 hover:text-white"
                    title="Stops the alarm for this order; it stays in the kitchen queue"
                  >
                    🔕 Silence
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SimpleDialog>
      )}

      {isLineNoteModalOpen && selectedLineId && (
        <LineNoteModal
          onClose={() => setIsLineNoteModalOpen(false)}
          initialNote={cartLines.find((l) => l.lineId === selectedLineId)?.notes || ''}
          onSave={(note) => {
            setCartLines((prev) => prev.map((l) => (l.lineId === selectedLineId ? { ...l, notes: note || undefined } : l)))
            setIsLineNoteModalOpen(false)
          }}
        />
      )}

      {receiptOrder && <ThermalReceipt order={receiptOrder} onClose={() => setReceiptOrder(null)} />}

      {isFastSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-16 px-4 bg-black/85 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Find an item" onKeyDown={(e) => e.key === 'Escape' && setIsFastSearchOpen(false)}>
          <div className="w-full max-w-xl rounded-3xl border border-amber-400/50 bg-slate-900 p-5 shadow-2xl space-y-4 text-white font-body">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-black text-sm text-white">🔍 Find an item</h3>
              <button type="button" onClick={() => setIsFastSearchOpen(false)} className="text-white/60 hover:text-white" aria-label="Close">
                ✕
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={fastSearchInput}
              onChange={(e) => setFastSearchInput(e.target.value)}
              placeholder="Type spud, coke, tuna…"
              className="w-full rounded-2xl border border-amber-400/40 bg-black/50 px-4 py-3 text-sm font-bold text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {storeProducts
                .filter((p) => {
                  const q = fastSearchInput.toLowerCase().trim()
                  return !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
                })
                .slice(0, 12)
                .map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    disabled={isSoldOut(product)}
                    onClick={() => {
                      handleItemClick(product)
                      setIsFastSearchOpen(false)
                      setFastSearchInput('')
                    }}
                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-amber-400 hover:text-ink transition text-left disabled:opacity-40"
                  >
                    <span className="text-xs font-black">{product.name}</span>
                    <span className="font-mono text-xs font-black">{isSoldOut(product) ? 'Sold out' : gbp(product.price)}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {isManagerAuthModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center [align-items:safe_center] justify-center overflow-y-auto p-4 bg-black/85 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Manager approval">
          <div className="w-full max-w-sm rounded-3xl border border-amber-400/50 bg-slate-900 p-6 shadow-2xl space-y-4 text-white font-body text-center">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-left">
                <span className="text-xl">🛡️</span>
                <div>
                  <h3 className="font-black text-sm text-white">{managerActionTitle || 'Manager approval'}</h3>
                  <p className="text-[10px] text-white/60">{managerActionDescription}</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsManagerAuthModalOpen(false)} className="text-white/60 hover:text-white" aria-label="Close">
                ✕
              </button>
            </div>
            <p className="text-xs text-amber-300 font-bold">Supervisor or manager PIN</p>
            <input
              type="password"
              maxLength={8}
              value={managerPinInput}
              onChange={(e) => setManagerPinInput(e.target.value)}
              placeholder="••••"
              autoFocus
              className="w-full rounded-2xl border border-white/20 bg-black/60 py-3 text-center font-mono text-3xl tracking-[0.5em] text-white focus:border-amber-400 focus:outline-none"
            />
            {managerPinError && <p className="rounded-xl bg-red-950/50 border border-red-500/40 p-2 text-xs text-red-300">{managerPinError}</p>}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    playPOSTouchTone('numpad')
                    setManagerPinInput((prev) => (prev.length < 8 ? prev + num : prev))
                  }}
                  className="rounded-xl border border-white/10 bg-white/5 py-3 font-mono text-lg font-bold text-white hover:bg-white/15"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setManagerPinInput('')
                  setManagerPinError(null)
                }}
                className="rounded-xl border border-red-500/30 bg-red-950/20 py-2.5 text-xs font-bold text-red-400 hover:bg-red-900/40"
              >
                Clear
              </button>
              <button type="button" onClick={() => setManagerPinInput((prev) => (prev.length < 8 ? prev + '0' : prev))} className="rounded-xl border border-white/10 bg-white/5 py-3 font-mono text-lg font-bold text-white hover:bg-white/15">
                0
              </button>
              <button type="button" onClick={() => setManagerPinInput((prev) => prev.slice(0, -1))} className="rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs font-bold text-white/70 hover:bg-white/15" aria-label="Delete digit">
                ⌫
              </button>
            </div>
            <div className="pt-2 flex gap-2">
              <button type="button" onClick={() => setIsManagerAuthModalOpen(false)} className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-bold text-white/60 hover:bg-white/15">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const check = verifyManagerPin(managerPinInput)
                  if (check.ok) {
                    playPOSTouchTone('action')
                    onManagerApproved?.(check.managerName || 'Manager')
                    setIsManagerAuthModalOpen(false)
                  } else {
                    setManagerPinError(check.message || 'That PIN is not a supervisor or manager PIN.')
                  }
                }}
                className="flex-[2] rounded-xl bg-amber-400 py-3 text-xs font-black uppercase text-ink hover:bg-amber-300 shadow-glow"
              >
                Approve →
              </button>
            </div>
          </div>
        </div>
      )}

      {isBarcodeModalOpen && (
        <SimpleDialog title="📟 Barcode / SKU" onClose={() => setIsBarcodeModalOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!barcodeInput.trim()) return
              const found = getProductByBarcode(barcodeInput)
              if (found) {
                handleItemClick(found)
                setIsBarcodeModalOpen(false)
                setBarcodeInput('')
              } else {
                setFlash(`No product matches ${barcodeInput}`)
              }
            }}
            className="space-y-3"
          >
            <input
              type="text"
              autoFocus
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Scan a barcode or type a SKU"
              className="w-full rounded-xl border border-sky-400/40 bg-black/60 px-4 py-3 font-mono text-base font-bold text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
            <button type="submit" className="w-full rounded-xl bg-sky-500 py-3 text-xs font-black uppercase text-ink hover:bg-sky-400 shadow transition">
              Add item →
            </button>
          </form>
        </SimpleDialog>
      )}

      {isCustomItemModalOpen && <CustomItemModal onClose={() => setIsCustomItemModalOpen(false)} onAddCustomItem={handleAddCustomLineItem} />}
    </div>
  )
}

function SimpleDialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[60] flex items-center [align-items:safe_center] justify-center overflow-y-auto p-4 bg-black/85 backdrop-blur-md" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${wide ? 'max-w-lg' : 'max-w-sm'} rounded-3xl border border-white/15 bg-slate-900 p-5 shadow-2xl text-white font-body`}>
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-white/10 pb-2">
          <h3 className="font-bold text-sm text-white">{title}</h3>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function TipDialog({ current, onClose, onSet }: { current: number; onClose: () => void; onSet: (pence: number) => void }) {
  const [custom, setCustom] = useState(current > 0 ? (current / 100).toFixed(2) : '')
  return (
    <SimpleDialog title="💝 Gratuity" onClose={onClose}>
      <p className="text-xs text-white/60">Tips are kept apart from sales on the end-of-day report.</p>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[0, 50, 100, 200].map((t) => (
          <button key={t} type="button" onClick={() => onSet(t)} className={`rounded-xl py-3 text-sm font-black transition ${current === t ? 'bg-amber-400 text-ink' : 'bg-white/5 text-white hover:bg-white/10'}`}>
            {t === 0 ? 'None' : gbp(t)}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const pence = Math.round((parseFloat(custom) || 0) * 100)
          if (pence >= 0 && pence <= 10000) onSet(pence)
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          inputMode="decimal"
          value={custom}
          onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setCustom(e.target.value)}
          placeholder="Other amount"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 font-mono text-sm text-white focus:border-amber-400 focus:outline-none"
        />
        <button type="submit" className="rounded-xl bg-amber-400 px-4 text-xs font-black uppercase text-ink hover:bg-amber-300">
          Set
        </button>
      </form>
    </SimpleDialog>
  )
}

function CustomItemModal({ onClose, onAddCustomItem }: { onClose: () => void; onAddCustomItem: (name: string, pricePence: number, station: 'spuds' | 'grill' | 'drinks') => void }) {
  const [name, setName] = useState('Misc item')
  const [priceString, setPriceString] = useState('')
  const [station, setStation] = useState<'spuds' | 'grill' | 'drinks'>('spuds')
  const parsed = parseFloat(priceString) || 0

  const handleNumpad = (val: string) => {
    playPOSTouchTone('tap')
    if (val === '⌫') return setPriceString((prev) => prev.slice(0, -1))
    if (val === '.') return setPriceString((prev) => (prev.includes('.') ? prev : prev ? `${prev}.` : '0.'))
    if (priceString.includes('.')) {
      const parts = priceString.split('.')
      if (parts[1] && parts[1].length >= 2) return
    }
    if (priceString.replace('.', '').length >= 5) return
    setPriceString((prev) => (prev === '0' ? val : `${prev}${val}`))
  }

  return (
    <SimpleDialog title="➕ Misc item" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (parsed <= 0) return
          onAddCustomItem(name, Math.round(parsed * 100), station)
        }}
        className="space-y-3"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What is it?"
          className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-white font-bold focus:border-purple-400 focus:outline-none"
          required
        />
        <div className="flex flex-wrap gap-1">
          {['Misc item', 'Extra filling', 'Side', 'Special', 'Price adjustment'].map((preset) => (
            <button key={preset} type="button" onClick={() => setName(preset)} className="rounded-lg bg-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-purple-600 hover:text-white transition">
              {preset}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-xl border-2 border-amber-400/40 bg-black/50 px-3 py-2">
          <span className="text-2xl font-black text-amber-400">£</span>
          <span className="font-mono text-2xl font-black text-white">{priceString || '0.00'}</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((d) => (
            <button key={d} type="button" onClick={() => handleNumpad(d)} className="h-11 rounded-xl bg-white/10 border border-white/10 font-mono text-base font-bold text-white hover:bg-white/20 active:scale-95 transition" aria-label={d === '⌫' ? 'Delete digit' : d}>
              {d}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ['spuds', '🥔 Oven'],
            ['grill', '🔥 Grill'],
            ['drinks', '🥤 Front'],
          ] as ['spuds' | 'grill' | 'drinks', string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setStation(id)} className={`py-2 rounded-xl text-[11px] font-bold border transition ${station === id ? 'bg-amber-400 text-ink border-amber-400 font-black' : 'bg-white/5 border-white/10 text-white/70'}`}>
              {label}
            </button>
          ))}
        </div>
        <button type="submit" disabled={parsed <= 0} className="w-full rounded-full bg-amber-400 py-3 font-body text-xs font-black uppercase tracking-wider text-ink hover:bg-amber-300 transition disabled:opacity-40">
          Add {parsed > 0 ? `£${parsed.toFixed(2)}` : ''} to the bill
        </button>
      </form>
    </SimpleDialog>
  )
}

function LineNoteModal({ onClose, initialNote, onSave }: { onClose: () => void; initialNote: string; onSave: (note: string) => void }) {
  const [noteText, setNoteText] = useState(initialNote)
  return (
    <SimpleDialog title="Note for the kitchen" onClose={onClose}>
      <input
        type="text"
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder="e.g. allergy, well done, cut in half"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
        autoFocus
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {['Extra crispy', 'Well done', 'Cut in half', 'Separate box', 'Allergy — see customer'].map((preset) => (
          <button key={preset} type="button" onClick={() => setNoteText((prev) => (prev ? `${prev}, ${preset}` : preset))} className="rounded-lg bg-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-white/20">
            +{preset}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onSave(noteText.trim())} className="mt-3 w-full rounded-full bg-amber-400 py-2.5 text-xs font-black uppercase text-ink hover:bg-amber-300">
        Save note
      </button>
    </SimpleDialog>
  )
}
