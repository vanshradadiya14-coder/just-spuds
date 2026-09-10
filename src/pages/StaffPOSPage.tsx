import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  getCurrentShift,
  openTillShift,
  closeTillShift,
  recordTillSale,
  performNoSaleDrawerKick,
  recordCashFloatAdjustment,
  subscribeShift,
  getTillSettings,
  subscribeTillSettings,
  calculateDenominationsTotal,
  EMPTY_DENOMINATIONS,
  getLastCompletedTillOrder,
  setLastCompletedTillOrder,
  type TillShift,
  type CashDenominations,
} from '../services/tillStore'
import {
  subscribeOrders,
  updateOrderStatus,
  createManualCounterOrder,
  type Order,
} from '../services/orderStore'
import {
  getCurrentUser,
  subscribeAuth,
  loginWithPin,
  logout,
  hasRole,
  type AuthUser,
} from '../services/authStore'
import { getProducts, subscribeMenu } from '../services/menuStore'
import { CATEGORIES, type Product } from '../data/menu'
import { lineUnitPrice, type CartLine, type CartLineModifier, type ModifierType } from '../hooks/useCart'
import { gbp } from '../utils/format'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import {
  triggerBrowserPrint,
  getPrinterStatus,
  subscribePrinterStatus,
  playPOSTouchTone,
  type PrinterDeviceStatus,
} from '../services/printerBridge'
import {
  notifyNewOnlineOrder,
  dismissOrderAlert,
  subscribeOrderAlerts,
  type OnlineOrderAlert,
} from '../services/alertSoundBus'
import {
  broadcastCFDState,
  resetCFDState,
} from '../services/cfdBus'
import ThermalReceipt from '../components/ThermalReceipt'
import ZReportReceipt from '../components/ZReportReceipt'

// Fast Shortcut Keys (Common counter drinks & crisps)
const FAST_BAR_ITEMS = [
  { id: 'cold-coke', name: 'Coca-Cola Can', price: 150, icon: '🥤', cat: 'COLD_DRINKS' },
  { id: 'cold-diet-coke', name: 'Diet Coke Can', price: 150, icon: '🥤', cat: 'COLD_DRINKS' },
  { id: 'cold-water', name: 'Spring Water 500ml', price: 120, icon: '💧', cat: 'COLD_DRINKS' },
  { id: 'snack-ready-salted', name: 'Walkers Ready Salted', price: 100, icon: '🥔', cat: 'SNACKS' },
  { id: 'snack-cheese-onion', name: 'Walkers Cheese & Onion', price: 100, icon: '🧀', cat: 'SNACKS' },
]

export default function StaffPOSPage() {
  useDocumentMeta({
    title: 'Food Store Till & POS Terminal',
    description: 'Commercial in-store food till and EPOS system with split payments, cash drawer and thermal printer connection.',
  })

  // Auth State
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser())
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)

  // Shift & Till State
  const [shift, setShift] = useState<TillShift | null>(() => getCurrentShift())
  const [tillSettings, setSettings] = useState(() => getTillSettings())
  const [, setPrinterStatus] = useState<PrinterDeviceStatus>(() => getPrinterStatus())

  // Menu & Products
  const [products, setProducts] = useState<Product[]>(() => getProducts())
  const [selectedCategory, setSelectedCategory] = useState<string>('SPUDS')
  const [searchQuery, setSearchQuery] = useState('')

  // Active Ticket State
  const [cartLines, setCartLines] = useState<CartLine[]>([])
  const [customerName, setCustomerName] = useState('')
  const [buzzerNumber, setBuzzerNumber] = useState('')
  const [tableNumber, setTableNumber] = useState('')
  const [orderType, setOrderType] = useState<'takeaway' | 'eat_in' | 'phone'>('takeaway')
  const [discountPercent, setDiscountPercent] = useState<number>(0)
  const [discountFixedPence, setDiscountFixedPence] = useState<number>(0)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)

  // Parked (Hold) Orders
  const [parkedOrders, setParkedOrders] = useState<
    Array<{ id: string; customer: string; lines: CartLine[]; type: 'takeaway' | 'eat_in' | 'phone'; time: string; buzzer?: string; table?: string }>
  >([])

  // Fast Numpad & Tender State
  const [tenderNumpadValue, setTenderNumpadValue] = useState<string>('')

  // Modal States
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null)
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false)
  const [isBillSplitModalOpen, setIsBillSplitModalOpen] = useState(false)
  const [evenSplitWays, setEvenSplitWays] = useState<number>(2)
  const [evenSplitPaidSteps, setEvenSplitPaidSteps] = useState<number>(0)
  const [selectedSplitLineIds, setSelectedSplitLineIds] = useState<string[]>([])
  const [isCompsModalOpen, setIsCompsModalOpen] = useState(false)
  const [compReason, setCompReason] = useState<string>('Spillage / Food Remake')
  const [isFastSearchOpen, setIsFastSearchOpen] = useState(false)
  const [fastSearchInput, setFastSearchInput] = useState('')
  const [isXReportOpen, setIsXReportOpen] = useState(false)
  const [isZReportOpen, setIsZReportOpen] = useState(false)
  const [isNoSaleModalOpen, setIsNoSaleModalOpen] = useState(false)
  const [isPayInOutModalOpen, setIsPayInOutModalOpen] = useState(false)
  const [isParkedModalOpen, setIsParkedModalOpen] = useState(false)
  const [isOnlineOrdersModalOpen, setIsOnlineOrdersModalOpen] = useState(false)
  const [isLineNoteModalOpen, setIsLineNoteModalOpen] = useState(false)

  // Split Pay Allocation State
  const [splitCashInput, setSplitCashInput] = useState<string>('')
  const [splitCardInput, setSplitCardInput] = useState<string>('')
  const [splitOnlineInput, setSplitOnlineInput] = useState<string>('')
  const [splitCustomerCashGiven, setSplitCustomerCashGiven] = useState<string>('')

  // Toast-Style Conversational Modifiers State
  const [selectedButter, setSelectedButter] = useState<'salted' | 'garlic' | 'vegan' | 'none'>('salted')
  const [conversationalMods, setConversationalMods] = useState<Record<string, ModifierType>>({})
  const [selectedSauces, setSelectedSauces] = useState<string[]>([])
  const [isMealDealCombo, setIsMealDealCombo] = useState(false)
  const [selectedMealDrink] = useState('cold-coke')
  const [selectedMealSnack] = useState('snack-ready-salted')
  const [speedTags, setSpeedTags] = useState<string[]>([])
  const [selectedStation, setSelectedStation] = useState<'spuds' | 'grill' | 'drinks'>('spuds')
  const [isRushTicket, setIsRushTicket] = useState(false)
  const [customItemNote] = useState('')

  // Starting Float
  const [startingFloatInput, setStartingFloatInput] = useState<number>(100)

  // Closing Z-Report Denominations & Loss Prevention Blind Count
  const [closingDenoms, setClosingDenoms] = useState<CashDenominations>({ ...EMPTY_DENOMINATIONS })
  const [closingNotes] = useState('')
  const [blindCountingConfirmed, setBlindCountingConfirmed] = useState(false)
  const [completedZReport, setCompletedZReport] = useState<TillShift | null>(null)

  // Receipt Printing
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null)
  const [lastOrder, setLastOrder] = useState<Order | null>(() => getLastCompletedTillOrder())

  // Online Order Siren Alerts
  const [activeAlerts, setActiveAlerts] = useState<OnlineOrderAlert[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())

  // Subscriptions
  useEffect(() => {
    const unsubAuth = subscribeAuth((u) => setUser(u))
    const unsubShift = subscribeShift((s) => setShift(s))
    const unsubSettings = subscribeTillSettings((st) => setSettings(st))
    const unsubPrinter = subscribePrinterStatus((p) => setPrinterStatus(p))
    const unsubAlerts = subscribeOrderAlerts((a) => setActiveAlerts(a))
    const unsubMenu = subscribeMenu(() => setProducts(getProducts()))

    const unsubOrders = subscribeOrders((allOrders) => {
      const placedOnline = allOrders.filter(
        (o) =>
          o.status === 'placed' &&
          !o.kitchenNotes?.includes('[MANUAL PHONE/COUNTER]') &&
          Date.now() - new Date(o.createdAt).getTime() < 30 * 60 * 1000
      )

      placedOnline.forEach((ord) => {
        notifyNewOnlineOrder({
          orderId: ord.id,
          shortId: ord.shortId,
          customerName: ord.customer.name,
          total: ord.payment.total,
          itemsSummary: ord.lines.map((l) => `${l.qty}x ${l.name}`).join(', '),
          timestamp: ord.createdAt,
        })
      })
    })

    const timer = setInterval(() => setCurrentTime(new Date()), 1000)

    return () => {
      unsubAuth()
      unsubShift()
      unsubSettings()
      unsubPrinter()
      unsubAlerts()
      unsubOrders()
      unsubMenu()
      clearInterval(timer)
    }
  }, [])

  const isAuthorized = hasRole(user, ['STAFF', 'STORE_MANAGER', 'ADMIN'])

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

  // Financial Calculations
  const subtotalPence = useMemo(() => {
    return cartLines.reduce((acc, l) => acc + lineUnitPrice(l) * l.qty, 0)
  }, [cartLines])

  const discountPence = useMemo(() => {
    let disc = 0
    if (discountPercent > 0) {
      disc += Math.round((subtotalPence * discountPercent) / 100)
    }
    if (discountFixedPence > 0) {
      disc += discountFixedPence
    }
    return Math.min(disc, subtotalPence)
  }, [subtotalPence, discountPercent, discountFixedPence])

  const totalDuePence = Math.max(0, subtotalPence - discountPence)
  const vatIncludedPence = Math.round((totalDuePence / 1.2) * 0.2)

  // Fast Numpad Cash Tender Calculation
  const tenderedCashPence = tenderNumpadValue
    ? Math.round(parseFloat(tenderNumpadValue) * 100)
    : 0
  const changeDuePence =
    tenderedCashPence > totalDuePence ? tenderedCashPence - totalDuePence : 0

  // Real-time synchronization to Customer-Facing Display (CFD)
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
      status: cartLines.length > 0 ? 'ordering' : 'idle',
    })
  }, [cartLines, subtotalPence, discountPence, totalDuePence, orderType, customerName, buzzerNumber, tableNumber])

  // Global Keyboard Shortcuts (Ctrl+K or / for Fast Search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && document.activeElement?.tagName !== 'INPUT')) {
        e.preventDefault()
        setIsFastSearchOpen(true)
        playPOSTouchTone('tap')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Category Color Theming
  const getCategoryColor = (catId: string, isSelected: boolean) => {
    switch (catId) {
      case 'SPUDS':
        return isSelected
          ? 'bg-amber-400 text-ink shadow-lg font-black border-amber-300 ring-2 ring-amber-400'
          : 'bg-amber-500/15 text-amber-300 border-amber-400/30 hover:bg-amber-500/25'
      case 'WRAPS':
        return isSelected
          ? 'bg-emerald-500 text-ink shadow-lg font-black border-emerald-400 ring-2 ring-emerald-500'
          : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30 hover:bg-emerald-500/25'
      case 'RICE_BOXES':
        return isSelected
          ? 'bg-indigo-600 text-white shadow-lg font-black border-indigo-500 ring-2 ring-indigo-500'
          : 'bg-indigo-500/15 text-indigo-300 border-indigo-400/30 hover:bg-indigo-500/25'
      case 'PANINIS':
      case 'BAGUETTES':
        return isSelected
          ? 'bg-orange-500 text-white shadow-lg font-black border-orange-400 ring-2 ring-orange-500'
          : 'bg-orange-500/15 text-orange-300 border-orange-400/30 hover:bg-orange-500/25'
      case 'SALADS':
        return isSelected
          ? 'bg-lime-500 text-ink shadow-lg font-black border-lime-400 ring-2 ring-lime-500'
          : 'bg-lime-500/15 text-lime-300 border-lime-400/30 hover:bg-lime-500/25'
      case 'HOT_DRINKS':
        return isSelected
          ? 'bg-yellow-700 text-white shadow-lg font-black border-yellow-600 ring-2 ring-yellow-600'
          : 'bg-yellow-600/15 text-yellow-300 border-yellow-500/30 hover:bg-yellow-600/25'
      case 'COLD_DRINKS':
        return isSelected
          ? 'bg-sky-500 text-ink shadow-lg font-black border-sky-400 ring-2 ring-sky-500'
          : 'bg-sky-500/15 text-sky-300 border-sky-400/30 hover:bg-sky-500/25'
      case 'SNACKS':
        return isSelected
          ? 'bg-rose-500 text-white shadow-lg font-black border-rose-400 ring-2 ring-rose-500'
          : 'bg-rose-500/15 text-rose-300 border-rose-400/30 hover:bg-rose-500/25'
      default:
        return isSelected
          ? 'bg-white text-ink shadow-lg font-black border-white'
          : 'bg-white/10 text-white border-white/10 hover:bg-white/20'
    }
  }

  const handleItemClick = (product: Product) => {
    playPOSTouchTone('tap')
    if (['HOT_DRINKS', 'COLD_DRINKS', 'SNACKS'].includes(product.category) && !product.extras?.length) {
      handleQuickAdd(product.name, product.price, product.id, product.category)
      return
    }

    setCustomizingProduct(product)
    setSelectedButter('salted')
    setConversationalMods({})
    setSelectedSauces([])
    setIsMealDealCombo(false)
    setSpeedTags([])
    setSelectedStation(product.category === 'SPUDS' ? 'spuds' : product.category === 'WRAPS' || product.category === 'PANINIS' ? 'grill' : 'drinks')
    setIsRushTicket(false)
  }

  const handleQuickAdd = (name: string, pricePence: number, id: string, cat: string) => {
    playPOSTouchTone('tap')
    const lineId = `${id}-${Date.now()}`
    const newLine: CartLine = {
      lineId,
      productId: id,
      name,
      base: pricePence,
      meal: false,
      extras: [],
      sauces: [],
      image: '',
      category: cat,
      qty: 1,
      station: cat === 'SPUDS' ? 'spuds' : cat === 'WRAPS' || cat === 'PANINIS' ? 'grill' : 'drinks',
    }
    setCartLines((prev) => [...prev, newLine])
    setSelectedLineId(lineId)
  }

  const handleConfirmCustomizer = () => {
    if (!customizingProduct) return
    playPOSTouchTone('action')

    // Toast-Style Conversational Modifiers
    const convList: CartLineModifier[] = []

    // Butter Modifiers
    if (selectedButter === 'none') {
      convList.push({ name: 'Butter', type: 'no' })
    } else if (selectedButter === 'garlic') {
      convList.push({ name: 'Garlic Butter', type: 'regular' })
    } else if (selectedButter === 'vegan') {
      convList.push({ name: 'Vegan Spread', type: 'regular' })
    }

    // Ingredient Conversational Mods
    Object.entries(conversationalMods).forEach(([name, modType]) => {
      convList.push({
        name,
        type: modType,
        pricePence: modType === 'extra' ? 100 : 0,
      })
    })

    const noteCombined = [
      isRushTicket ? '🔥 RUSH ORDER' : null,
      ...speedTags,
      customItemNote.trim(),
    ].filter(Boolean).join(', ')

    const newLine: CartLine = {
      lineId: `${customizingProduct.id}-${Date.now()}`,
      productId: customizingProduct.id,
      name: customizingProduct.name,
      base: customizingProduct.price,
      meal: isMealDealCombo,
      mealDrink: isMealDealCombo ? selectedMealDrink : undefined,
      mealSnack: isMealDealCombo ? selectedMealSnack : undefined,
      extras: [],
      sauces: selectedSauces,
      image: customizingProduct.image,
      category: customizingProduct.category,
      notes: noteCombined || undefined,
      qty: 1,
      conversationalModifiers: convList,
      station: selectedStation,
      isRush: isRushTicket,
    }

    setCartLines((prev) => [...prev, newLine])
    setSelectedLineId(newLine.lineId!)
    setCustomizingProduct(null)
  }

  const handleUpdateLineQty = (lineId: string, delta: number) => {
    playPOSTouchTone('numpad')
    setCartLines((prev) =>
      prev
        .map((l) => {
          if (l.lineId === lineId) {
            const next = l.qty + delta
            return next > 0 ? { ...l, qty: next } : null
          }
          return l
        })
        .filter(Boolean) as CartLine[]
    )
  }

  const handleVoidSelectedLine = () => {
    if (!selectedLineId) return
    playPOSTouchTone('action')
    setCartLines((prev) => prev.filter((l) => l.lineId !== selectedLineId))
    setSelectedLineId(null)
  }

  const handleClearAllTicket = () => {
    if (cartLines.length === 0) return
    if (confirm('VOID entire active ticket?')) {
      playPOSTouchTone('action')
      setCartLines([])
      setDiscountPercent(0)
      setDiscountFixedPence(0)
      setCustomerName('')
      setBuzzerNumber('')
      setTableNumber('')
      setTenderNumpadValue('')
      setSelectedLineId(null)
      resetCFDState()
    }
  }

  const handleParkTicket = () => {
    if (cartLines.length === 0) return
    playPOSTouchTone('action')
    const newParked = {
      id: `pk-${Date.now()}`,
      customer: customerName.trim() || `Customer #${parkedOrders.length + 1}`,
      buzzer: buzzerNumber.trim() || undefined,
      table: tableNumber.trim() || undefined,
      lines: [...cartLines],
      type: orderType,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setParkedOrders((prev) => [newParked, ...prev])
    setCartLines([])
    setCustomerName('')
    setBuzzerNumber('')
    setTableNumber('')
    setDiscountPercent(0)
    setDiscountFixedPence(0)
    setTenderNumpadValue('')
    setSelectedLineId(null)
    resetCFDState()
  }

  const handleResumeParkedTicket = (parkedId: string) => {
    const item = parkedOrders.find((p) => p.id === parkedId)
    if (!item) return
    playPOSTouchTone('action')
    setCartLines(item.lines)
    setCustomerName(item.customer)
    if (item.buzzer) setBuzzerNumber(item.buzzer)
    if (item.table) setTableNumber(item.table)
    setOrderType(item.type)
    setParkedOrders((prev) => prev.filter((p) => p.id !== parkedId))
    setIsParkedModalOpen(false)
  }

  const handleNumpadPress = (char: string) => {
    playPOSTouchTone('numpad')
    if (char === 'C') {
      setTenderNumpadValue('')
    } else if (char === '.') {
      if (!tenderNumpadValue.includes('.')) {
        setTenderNumpadValue((prev) => (prev ? prev + '.' : '0.'))
      }
    } else {
      setTenderNumpadValue((prev) => prev + char)
    }
  }

  const handleSetQuickCash = (amountPounds: number) => {
    playPOSTouchTone('numpad')
    setTenderNumpadValue(amountPounds.toFixed(2))
  }

  // Single Tender Finalization (CASH or CARD)
  const handleCompletePayment = (method: 'cash' | 'card') => {
    if (cartLines.length === 0) return
    playPOSTouchTone('action')

    const actor = user?.name || 'Staff Cashier'
    const orderTitle = customerName.trim() || (orderType === 'eat_in' ? 'Dine In Customer' : 'Counter Takeaway')

    const newOrder = createManualCounterOrder(
      {
        customerName: orderTitle,
        customerPhone: '01296 423456',
        fulfilment: 'pickup',
        lines: cartLines,
        paymentMethod: method,
        paymentStatus: 'paid',
        discount: discountPence,
        buzzerNumber: buzzerNumber.trim() || undefined,
        tableNumber: tableNumber.trim() || undefined,
        notes: `[POS TILL #01] ${orderType.toUpperCase()} • Cashier: ${actor}${buzzerNumber ? ` • Buzzer #${buzzerNumber}` : ''}${tableNumber ? ` • Table #${tableNumber}` : ''}`,
      },
      actor
    )

    recordTillSale({
      paymentMethod: method,
      totalPence: totalDuePence,
      discountPence: discountPence > 0 ? discountPence : undefined,
      orderId: newOrder.shortId,
      staffName: actor,
    })

    setLastCompletedTillOrder(newOrder)
    setLastOrder(newOrder)

    // Broadcast completion to Customer-Facing Display
    broadcastCFDState({
      status: 'paid',
      completedOrderShortId: newOrder.shortId,
      changeDuePence,
      tenderMethod: method === 'cash' ? '💵 Cash' : '💳 Card',
    })

    if (tillSettings.autoPrintTillReceipt) {
      setReceiptOrder(newOrder)
    }

    setCartLines([])
    setCustomerName('')
    setBuzzerNumber('')
    setTableNumber('')
    setDiscountPercent(0)
    setDiscountFixedPence(0)
    setTenderNumpadValue('')
    setSelectedLineId(null)
  }

  // Split Payment Handlers (e.g. Some online/card and rest cash)
  const handleOpenSplitModal = () => {
    if (cartLines.length === 0) return
    playPOSTouchTone('tap')
    const half = (totalDuePence / 200).toFixed(2)
    const remainder = ((totalDuePence - Math.round(parseFloat(half) * 100)) / 100).toFixed(2)
    setSplitCashInput(half)
    setSplitCardInput(remainder)
    setSplitOnlineInput('0.00')
    setSplitCustomerCashGiven(half)
    setIsSplitModalOpen(true)
    broadcastCFDState({ status: 'tender', tenderMethod: 'Split Tender' })
  }

  const handleCompleteSplitPayment = () => {
    if (cartLines.length === 0) return
    playPOSTouchTone('action')

    const cashPence = Math.round(parseFloat(splitCashInput || '0') * 100)
    const cardPence = Math.round(parseFloat(splitCardInput || '0') * 100)
    const onlinePence = Math.round(parseFloat(splitOnlineInput || '0') * 100)
    const sumPence = cashPence + cardPence + onlinePence

    if (Math.abs(sumPence - totalDuePence) > 1) {
      alert(`Split totals (£${(sumPence / 100).toFixed(2)}) must equal the total due (£${(totalDuePence / 100).toFixed(2)}).`)
      return
    }

    const actor = user?.name || 'Staff Cashier'
    const orderTitle = customerName.trim() || (orderType === 'eat_in' ? 'Dine In Customer' : 'Counter Takeaway')

    const splitDetails = [
      cashPence > 0 ? { method: 'cash' as const, amount: cashPence } : null,
      cardPence > 0 ? { method: 'card' as const, amount: cardPence } : null,
      onlinePence > 0 ? { method: 'online' as const, amount: onlinePence } : null,
    ].filter(Boolean) as Array<{ method: 'cash' | 'card' | 'online'; amount: number }>

    const partsSummary = [
      cashPence > 0 ? `Cash £${(cashPence / 100).toFixed(2)}` : null,
      cardPence > 0 ? `Card £${(cardPence / 100).toFixed(2)}` : null,
      onlinePence > 0 ? `Online £${(onlinePence / 100).toFixed(2)}` : null,
    ].filter(Boolean).join(' + ')

    const newOrder = createManualCounterOrder(
      {
        customerName: orderTitle,
        customerPhone: '01296 423456',
        fulfilment: 'pickup',
        lines: cartLines,
        paymentMethod: 'split',
        paymentStatus: 'paid',
        discount: discountPence,
        buzzerNumber: buzzerNumber.trim() || undefined,
        tableNumber: tableNumber.trim() || undefined,
        notes: `[SPLIT TENDER: ${partsSummary}] • Cashier: ${actor}${buzzerNumber ? ` • Buzzer #${buzzerNumber}` : ''}${tableNumber ? ` • Table #${tableNumber}` : ''}`,
        splitDetails,
      },
      actor
    )

    recordTillSale({
      paymentMethod: 'split',
      totalPence: totalDuePence,
      discountPence: discountPence > 0 ? discountPence : undefined,
      orderId: newOrder.shortId,
      staffName: actor,
      splitCashPence: cashPence,
      splitCardPence: cardPence,
      splitOnlinePence: onlinePence,
    })

    setLastCompletedTillOrder(newOrder)
    setLastOrder(newOrder)

    // Broadcast to Customer-Facing Display
    broadcastCFDState({
      status: 'paid',
      completedOrderShortId: newOrder.shortId,
      changeDuePence: parseFloat(splitCustomerCashGiven) > (cashPence / 100) ? Math.round((parseFloat(splitCustomerCashGiven) - cashPence / 100) * 100) : 0,
      tenderMethod: '🔀 Split Tender',
    })

    if (tillSettings.autoPrintTillReceipt) {
      setReceiptOrder(newOrder)
    }

    setCartLines([])
    setCustomerName('')
    setBuzzerNumber('')
    setTableNumber('')
    setDiscountPercent(0)
    setDiscountFixedPence(0)
    setTenderNumpadValue('')
    setSelectedLineId(null)
    setIsSplitModalOpen(false)
  }

  // Toast-Style Comps & Manager Discounts
  const handleApplyComp = (percent: number, customReason?: string) => {
    playPOSTouchTone('comp')
    if (percent === 100) {
      setDiscountPercent(0)
      setDiscountFixedPence(subtotalPence)
      const reasonUsed = customReason || compReason || '100% Manager Courtesy'
      setCustomerName((prev) => prev ? `${prev} (COMP: ${reasonUsed})` : `COMP: ${reasonUsed}`)
    } else {
      setDiscountFixedPence(0)
      setDiscountPercent(percent)
    }
    setIsCompsModalOpen(false)
  }

  const handleClearDiscounts = () => {
    playPOSTouchTone('action')
    setDiscountPercent(0)
    setDiscountFixedPence(0)
    setIsCompsModalOpen(false)
  }

  // Toast/Square Even Split Bill Handler
  const evenSplitPortionPence = Math.round(totalDuePence / Math.max(1, evenSplitWays))

  const handlePayEvenSplitPortion = (method: 'cash' | 'card') => {
    if (cartLines.length === 0) return
    playPOSTouchTone('action')
    const nextStep = evenSplitPaidSteps + 1
    setEvenSplitPaidSteps(nextStep)

    const actor = user?.name || 'Staff Cashier'
    const portionPence = nextStep === evenSplitWays
      ? totalDuePence - evenSplitPortionPence * (evenSplitWays - 1)
      : evenSplitPortionPence

    recordTillSale({
      paymentMethod: method,
      totalPence: portionPence,
      orderId: `SPLIT-${nextStep}/${evenSplitWays}`,
      staffName: actor,
      splitCashPence: method === 'cash' ? portionPence : 0,
      splitCardPence: method === 'card' ? portionPence : 0,
    })

    if (nextStep >= evenSplitWays) {
      // Completed all split portions! Finalize order
      const newOrder = createManualCounterOrder(
        {
          customerName: customerName.trim() || `Split Bill (${evenSplitWays}-Way)`,
          customerPhone: '01296 423456',
          fulfilment: 'pickup',
          lines: cartLines,
          paymentMethod: 'split',
          paymentStatus: 'paid',
          discount: discountPence,
          buzzerNumber: buzzerNumber.trim() || undefined,
          tableNumber: tableNumber.trim() || undefined,
          notes: `[EVEN SPLIT BILL ${evenSplitWays}-WAY] • Cashier: ${actor}`,
        },
        actor
      )

      setLastCompletedTillOrder(newOrder)
      setLastOrder(newOrder)
      if (tillSettings.autoPrintTillReceipt) {
        setReceiptOrder(newOrder)
      }

      setCartLines([])
      setCustomerName('')
      setBuzzerNumber('')
      setTableNumber('')
      setDiscountPercent(0)
      setDiscountFixedPence(0)
      setTenderNumpadValue('')
      setSelectedLineId(null)
      setIsBillSplitModalOpen(false)
      setEvenSplitPaidSteps(0)
    }
  }

  // Toast Split by Items Handler
  const handleCreateSplitTicketFromSelected = () => {
    if (selectedSplitLineIds.length === 0) return
    playPOSTouchTone('action')

    const linesToMove = cartLines.filter((l) => selectedSplitLineIds.includes(l.lineId))
    const remainingLines = cartLines.filter((l) => !selectedSplitLineIds.includes(l.lineId))

    // Park the remaining lines so cashier can complete the split lines right now
    const newParked = {
      id: `pk-${Date.now()}`,
      customer: `${customerName || 'Guest 2'} (Remaining Items)`,
      buzzer: buzzerNumber || undefined,
      table: tableNumber || undefined,
      lines: remainingLines,
      type: orderType,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setParkedOrders((prev) => [newParked, ...prev])

    // Set active ticket to just the selected split lines
    setCartLines(linesToMove)
    setCustomerName(`${customerName || 'Guest 1'} (Split Ticket)`)
    setSelectedSplitLineIds([])
    setIsBillSplitModalOpen(false)
  }

  // Fast Search Select
  const handleFastSearchSelect = (product: Product) => {
    playPOSTouchTone('tap')
    handleItemClick(product)
    setIsFastSearchOpen(false)
    setFastSearchInput('')
  }

  const handleOpenShift = () => {
    if (startingFloatInput < 0) return
    const floatPence = Math.round(startingFloatInput * 100)
    openTillShift(user?.name || 'Staff Cashier', floatPence)
  }

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'ALL' || p.category === selectedCategory
      const matchSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
      return matchCat && matchSearch
    })
  }, [products, selectedCategory, searchQuery])

  // Authentication PIN Gate
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 select-none">
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
            <span>Kitchen KDS</span>
          </Link>
        </div>

        <div className="w-full max-w-sm rounded-3xl border border-amber-400/30 bg-gradient-to-b from-slate-900 to-black p-8 shadow-2xl text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-amber-400 text-3xl shadow-glow text-ink">
            🥔
          </div>
          <h1 className="display text-2xl text-white font-bold tracking-tight">EPOS Food Till Station</h1>
          <p className="font-body text-xs text-white/60 mt-1 mb-6">
            Enter your Staff PIN to access the cash register &amp; counter till.
          </p>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <input
              type="password"
              maxLength={4}
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
                  onClick={() => setPinInput((prev) => (prev.length < 4 ? prev + num : prev))}
                  className="rounded-xl border border-white/10 bg-white/5 py-3.5 font-mono text-xl font-bold text-white hover:bg-white/15 transition active:scale-95"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPinInput('')}
                className="rounded-xl border border-red-500/20 bg-red-950/20 py-3 font-body text-xs font-bold text-red-400 hover:bg-red-900/40"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setPinInput((prev) => (prev.length < 4 ? prev + '0' : prev))}
                className="rounded-xl border border-white/10 bg-white/5 py-3 font-mono text-xl font-bold text-white hover:bg-white/15"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                className="rounded-xl border border-white/10 bg-white/5 py-3 font-body text-xs font-bold text-white hover:bg-white/15"
              >
                ⌫
              </button>
            </div>

            {pinError && (
              <p className="rounded-xl bg-red-950/50 border border-red-500/40 p-2.5 font-body text-xs text-red-300">
                {pinError}
              </p>
            )}

            <button
              type="submit"
              className="w-full rounded-full bg-amber-400 py-3.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition"
            >
              Sign In to Food Till →
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Shift Closed Gate
  if (!shift || shift.status === 'closed') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 select-none">
        <div className="w-full max-w-md rounded-3xl border border-amber-400/40 bg-gradient-to-b from-slate-900 to-black p-8 shadow-2xl text-center space-y-6">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-amber-400/20 border border-amber-400/40 text-4xl">
            🔒
          </div>
          <div>
            <h1 className="display text-2xl font-black text-white">Till Drawer is Locked</h1>
            <p className="font-body text-xs text-white/60 mt-1">
              Terminal: <strong>TILL 01</strong> &bull; Cashier: <strong>{user?.name}</strong>
            </p>
          </div>

          <div className="space-y-4 text-left">
            <label className="block text-xs font-bold uppercase tracking-wider text-amber-300">
              Opening Float Amount (£):
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-amber-400">£</span>
              <input
                type="number"
                min={0}
                step={5}
                value={startingFloatInput}
                onChange={(e) => setStartingFloatInput(parseFloat(e.target.value) || 0)}
                className="w-full rounded-2xl border border-white/20 bg-white/10 pl-10 pr-4 py-3.5 font-mono text-2xl font-bold text-white focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[50, 100, 150, 200].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setStartingFloatInput(preset)}
                  className={`rounded-xl py-2 font-mono text-xs font-bold border transition ${
                    startingFloatInput === preset
                      ? 'bg-amber-400 text-ink border-amber-400 shadow-glow'
                      : 'bg-white/5 text-white border-white/10 hover:bg-white/15'
                  }`}
                >
                  £{preset}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenShift}
            className="w-full rounded-full bg-amber-400 py-4 font-body text-sm font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition active:scale-95 flex items-center justify-center gap-2"
          >
            <span>🔓</span>
            <span>Open Register &amp; Kick Cash Drawer</span>
          </button>

          <div className="flex justify-between items-center pt-2 border-t border-white/10 text-xs">
            <Link to="/staff" className="text-amber-300 hover:underline">
              Kitchen KDS Display →
            </Link>
            <button type="button" onClick={logout} className="text-red-400 hover:underline">
              Lock Station
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden select-none font-body">
      {/* 1. TOP EPOS COMMAND & STATUS BAR */}
      <header className="h-14 border-b border-white/10 bg-slate-900 px-3 flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-xl bg-black/60 border border-white/10 px-2.5 py-1">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shadow-glow" />
            <span className="font-mono text-xs font-black tracking-wider text-white">TILL 01</span>
            <span className="text-[10px] text-white/50 font-bold hidden sm:inline">| MARKET SQ</span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs">
            <span className="font-bold text-white/80">{user?.name}</span>
            <span className="text-white/30">&bull;</span>
            <span className="font-mono text-amber-300 font-bold">SHIFT #{shift.shiftNumber}</span>
            <span className="text-white/30">&bull;</span>
            <span className="font-mono text-emerald-400 font-bold">FLOAT {gbp(shift.startingFloat)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeAlerts.length > 0 && (
            <button
              type="button"
              onClick={() => setIsOnlineOrdersModalOpen(true)}
              className="rounded-xl bg-rose-600 px-3 py-1 font-body text-xs font-black text-white shadow-glow hover:bg-rose-500 transition animate-bounce flex items-center gap-1.5"
            >
              <span>🚨</span>
              <span>{activeAlerts.length} Online Order{activeAlerts.length > 1 ? 's' : ''} Pending!</span>
            </button>
          )}

          {parkedOrders.length > 0 && (
            <button
              type="button"
              onClick={() => setIsParkedModalOpen(true)}
              className="rounded-xl bg-purple-600 px-3 py-1 font-body text-xs font-black text-white shadow hover:bg-purple-500 transition flex items-center gap-1"
            >
              <span>⏸️</span>
              <span>Parked ({parkedOrders.length})</span>
            </button>
          )}

          <div className="rounded-xl border border-white/10 bg-black/40 px-2.5 py-1 font-mono text-xs font-bold text-amber-300 hidden lg:block">
            🕒 {currentTime.toLocaleTimeString()}
          </div>

          <button
            type="button"
            onClick={() => setIsNoSaleModalOpen(true)}
            className="rounded-xl border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/20 transition active:scale-95 flex items-center gap-1"
            title="Open Cash Drawer without a sale"
          >
            <span>🔓</span>
            <span className="hidden sm:inline">No Sale</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPayInOutModalOpen(true)}
            className="rounded-xl border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/20 transition hidden sm:flex items-center gap-1"
            title="Record petty cash in/out"
          >
            <span>💵</span>
            <span>Float In/Out</span>
          </button>

          <button
            type="button"
            onClick={() => setIsXReportOpen(true)}
            className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-400 hover:text-ink transition hidden md:flex items-center gap-1"
            title="View mid-shift sales reading without closing"
          >
            <span>📊</span>
            <span>X-Report</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setClosingDenoms({ ...EMPTY_DENOMINATIONS })
              setIsZReportOpen(true)
            }}
            className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-2.5 py-1 text-xs font-bold text-rose-300 hover:bg-rose-900/60 transition flex items-center gap-1"
            title="End of day register closure and cash reconciliation"
          >
            <span>📋</span>
            <span>Close Z-Report</span>
          </button>

          <Link
            to="/staff"
            className="rounded-xl bg-amber-400 px-3 py-1 font-body text-xs font-black text-ink shadow hover:bg-amber-300 transition flex items-center gap-1"
          >
            <span>👨‍🍳</span>
            <span className="hidden sm:inline">KDS</span>
          </Link>

          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-red-500/20 bg-red-950/30 p-1.5 text-red-400 hover:bg-red-900/50"
            title="Lock terminal"
          >
            🔒
          </button>
        </div>
      </header>

      {/* 2. MAIN EPOS 3-PANEL WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        {/* PANEL A: VERTICAL CATEGORY SPEED BUTTONS */}
        <aside className="w-36 sm:w-44 lg:w-48 bg-slate-900 border-r border-white/10 flex flex-col shrink-0 p-2 space-y-1.5 overflow-y-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`w-full py-3 px-2 rounded-xl text-xs font-black uppercase tracking-wider text-center border transition ${
              selectedCategory === 'ALL'
                ? 'bg-amber-400 text-ink shadow-glow border-amber-300'
                : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
            }`}
          >
            ★ All Items
          </button>

          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`w-full py-3 px-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-left border transition flex items-center justify-between ${getCategoryColor(
                  cat.id,
                  isSelected
                )}`}
              >
                <span className="truncate">{cat.label}</span>
                {isSelected && <span className="text-[10px]">▶</span>}
              </button>
            )
          })}

          {/* Speed Fast Keys (1-Tap Drinks & Crisps) */}
          <div className="pt-3 border-t border-white/10 space-y-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40 px-1">Speed Fast Keys</p>
            {FAST_BAR_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleQuickAdd(item.name, item.price, item.id, item.cat)}
                className="w-full rounded-lg bg-black/40 border border-white/10 p-1.5 text-left hover:border-amber-400 transition flex items-center justify-between text-[11px]"
              >
                <span className="truncate text-white font-bold">{item.name}</span>
                <span className="font-mono text-amber-300 font-bold shrink-0">{gbp(item.price)}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* PANEL B: TOUCH ITEM GRID & SPEED SPUD BUILDER */}
        <section className="flex-1 flex flex-col min-w-0 bg-slate-950">
          <div className="p-2.5 border-b border-white/10 bg-slate-900/50 flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const baseSpud = products.find((p) => p.id === 'spud-just-a') || products[0]
                if (baseSpud) handleItemClick(baseSpud)
              }}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 py-2.5 px-4 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:from-amber-300 hover:to-amber-400 transition active:scale-95 flex items-center justify-center gap-2"
            >
              <span className="text-base">🥔</span>
              <span>+ Build Custom Jacket Potato (Wizard)</span>
            </button>

            <div className="w-48 sm:w-60">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Search menu..."
                className="w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white placeholder-white/40 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 p-3 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5 auto-rows-max">
            {filteredProducts.map((prod) => (
              <button
                key={prod.id}
                type="button"
                onClick={() => handleItemClick(prod)}
                className="rounded-2xl border border-white/15 bg-slate-900 p-3 text-left transition hover:border-amber-400 hover:bg-slate-800 active:scale-95 shadow-md flex flex-col justify-between min-h-[110px] group"
              >
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="font-body text-xs font-black text-white line-clamp-2 group-hover:text-amber-300">
                      {prod.name}
                    </h3>
                    {prod.vegetarian && (
                      <span className="text-[10px] shrink-0" title="Vegetarian">🌿</span>
                    )}
                  </div>
                  <p className="font-body text-[10px] text-white/50 line-clamp-1 mt-1">
                    {prod.description}
                  </p>
                </div>

                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="font-mono text-sm font-black text-amber-300">
                    {gbp(prod.price)}
                  </span>
                  <span className="rounded-lg bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white group-hover:bg-amber-400 group-hover:text-ink transition">
                    + Add
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* PANEL C: EPOS RECEIPT TAPE & NUMPAD CONSOLE */}
        <aside className="w-80 sm:w-96 lg:w-[420px] bg-slate-900 border-l border-white/10 flex flex-col shrink-0 shadow-2xl">
          <div className="p-2.5 border-b border-white/10 bg-black/40 space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex rounded-xl bg-white/5 p-1 border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setOrderType('takeaway')}
                  className={`px-3 py-1 rounded-lg font-black transition ${
                    orderType === 'takeaway' ? 'bg-amber-400 text-ink shadow-glow' : 'text-white/60 hover:text-white'
                  }`}
                >
                  🛍️ Takeaway
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('eat_in')}
                  className={`px-3 py-1 rounded-lg font-black transition ${
                    orderType === 'eat_in' ? 'bg-amber-400 text-ink shadow-glow' : 'text-white/60 hover:text-white'
                  }`}
                >
                  🍽️ Eat In
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('phone')}
                  className={`px-2 py-1 rounded-lg font-black transition ${
                    orderType === 'phone' ? 'bg-amber-400 text-ink shadow-glow' : 'text-white/60 hover:text-white'
                  }`}
                >
                  📞 Phone
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleParkTicket}
                  disabled={cartLines.length === 0}
                  className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-bold text-white/80 hover:bg-white/15 disabled:opacity-30"
                  title="Park ticket to serve next customer"
                >
                  ⏸️ Hold
                </button>
                <button
                  type="button"
                  onClick={handleClearAllTicket}
                  disabled={cartLines.length === 0}
                  className="rounded-xl border border-red-500/20 bg-red-950/20 px-2.5 py-1 text-xs font-bold text-red-400 hover:bg-red-900/40 disabled:opacity-30"
                  title="Void entire ticket"
                >
                  Void
                </button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-1.5">
              <div className="col-span-4 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs">🔔</span>
                <input
                  type="text"
                  value={buzzerNumber}
                  onChange={(e) => setBuzzerNumber(e.target.value)}
                  placeholder="Buzzer #"
                  className="w-full rounded-xl border border-white/10 bg-black/60 pl-7 pr-2 py-1.5 font-mono text-xs font-black text-amber-300 placeholder-white/30 focus:border-amber-400 focus:outline-none"
                />
              </div>
              <div className="col-span-3 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs">🪑</span>
                <input
                  type="text"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Tbl #"
                  className="w-full rounded-xl border border-white/10 bg-black/60 pl-7 pr-2 py-1.5 font-mono text-xs font-black text-indigo-300 placeholder-white/30 focus:border-indigo-400 focus:outline-none"
                />
              </div>
              <div className="col-span-5">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Guest / Phone..."
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Digital Receipt Journal */}
          <div className="flex-1 p-2.5 overflow-y-auto space-y-1.5 bg-black/20">
            {cartLines.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40">
                <span className="text-4xl mb-2">🧾</span>
                <p className="font-body text-xs font-black uppercase tracking-wider">Till Ticket is Empty</p>
                <p className="font-body text-[11px] text-white/50 mt-0.5">Tap menu items on left to build order</p>
              </div>
            ) : (
              cartLines.map((line) => {
                const isSelected = selectedLineId === line.lineId
                return (
                  <div
                    key={line.lineId}
                    onClick={() => setSelectedLineId(line.lineId!)}
                    className={`rounded-xl border p-2 text-xs transition cursor-pointer ${
                      isSelected
                        ? 'border-amber-400 bg-amber-400/10 shadow'
                        : 'border-white/10 bg-black/40 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="font-black text-white text-[13px]">
                        <span>{line.qty}x {line.name}</span>
                      </div>
                      <span className="font-mono font-bold text-amber-300">
                        {gbp(lineUnitPrice(line) * line.qty)}
                      </span>
                    </div>

                    {/* Toast-Style Conversational Modifiers */}
                    {line.conversationalModifiers && line.conversationalModifiers.length > 0 && (
                      <div className="pl-3 flex flex-wrap gap-1 mt-1">
                        {line.conversationalModifiers.map((mod, idx) => (
                          <span
                            key={idx}
                            className={`px-1.5 py-0.5 text-[9px] rounded font-bold uppercase tracking-tight ${
                              mod.type === 'extra'
                                ? 'bg-amber-400/25 text-amber-300 border border-amber-400/40 font-black'
                                : mod.type === 'no'
                                ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40 line-through font-bold'
                                : mod.type === 'lite'
                                ? 'bg-sky-500/25 text-sky-300 border border-sky-500/40'
                                : mod.type === 'side'
                                ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40'
                                : 'bg-white/10 text-white/70'
                            }`}
                          >
                            {mod.type === 'extra' && '+ '}
                            {mod.type === 'no' && 'NO '}
                            {mod.type === 'lite' && 'LITE '}
                            {mod.name}
                            {mod.type === 'side' && ' (SIDE)'}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Kitchen Station & Rush Indicators */}
                    {(line.station || line.isRush) && (
                      <div className="pl-3 flex items-center gap-1 mt-0.5 text-[9px]">
                        {line.station && (
                          <span className="font-black uppercase text-white/40 px-1 py-0.2 rounded bg-white/5">
                            {line.station}
                          </span>
                        )}
                        {line.isRush && (
                          <span className="font-black uppercase text-rose-400 animate-pulse">
                            🔥 RUSH
                          </span>
                        )}
                      </div>
                    )}

                    {line.extras && line.extras.length > 0 && (
                      <div className="pl-3 text-[10px] text-white/70 space-y-0.5 mt-0.5">
                        {line.extras.map((ext, idx) => (
                          <p key={idx}>↳ {ext}</p>
                        ))}
                      </div>
                    )}
                    {line.sauces && line.sauces.length > 0 && (
                      <p className="pl-3 text-[10px] text-amber-300/80">
                        ↳ Sauce: {line.sauces.join(', ')}
                      </p>
                    )}
                    {line.meal && (
                      <p className="pl-3 text-[10px] font-bold text-emerald-400">
                        ↳ Combo Deal (+£1.80)
                      </p>
                    )}
                    {line.notes && (
                      <p className="pl-3 text-[10px] italic text-rose-300">
                        * Note: {line.notes}
                      </p>
                    )}

                    {isSelected && (
                      <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleUpdateLineQty(line.lineId!, -1) }}
                            className="grid h-6 w-6 place-items-center rounded bg-white/10 text-white font-bold hover:bg-white/20"
                          >
                            -
                          </button>
                          <span className="font-mono text-xs font-bold text-white w-5 text-center">
                            {line.qty}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleUpdateLineQty(line.lineId!, 1) }}
                            className="grid h-6 w-6 place-items-center rounded bg-white/10 text-white font-bold hover:bg-white/20"
                          >
                            +
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setIsLineNoteModalOpen(true) }}
                            className="rounded px-2 py-0.5 text-[10px] font-bold bg-white/10 text-white/80 hover:bg-white/20"
                          >
                            + Note
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleVoidSelectedLine() }}
                            className="rounded px-2 py-0.5 text-[10px] font-bold bg-red-950/60 border border-red-500/40 text-red-300 hover:bg-red-900"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Running Totals & VAT Breakdown */}
          <div className="p-2.5 border-t border-white/10 bg-black/60 space-y-1 text-xs shrink-0">
            <div className="flex justify-between text-white/70 text-[11px]">
              <span>Items: {cartLines.reduce((a, b) => a + b.qty, 0)} &bull; Subtotal</span>
              <span className="font-mono font-bold">{gbp(subtotalPence)}</span>
            </div>
            {discountPence > 0 && (
              <div className="flex justify-between font-bold text-amber-300 text-[11px]">
                <span>Discount Applied</span>
                <span className="font-mono">-{gbp(discountPence)}</span>
              </div>
            )}
            <div className="flex justify-between text-white/40 text-[10px]">
              <span>VAT @ 20% (Included)</span>
              <span className="font-mono">{gbp(vatIncludedPence)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-1 border-t border-white/15">
              <span className="font-black text-sm text-white uppercase tracking-wider">Total Due</span>
              <span className="font-mono text-2xl font-black text-amber-400">
                {gbp(totalDuePence)}
              </span>
            </div>
          </div>

          {/* Change Display Bar */}
          {tenderedCashPence > 0 && (
            <div
              className={`p-2 text-center text-xs font-black border-t transition shrink-0 ${
                tenderedCashPence >= totalDuePence
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
              }`}
            >
              {tenderedCashPence >= totalDuePence ? (
                <div className="flex justify-between items-center px-2">
                  <span>Tendered: {gbp(tenderedCashPence)}</span>
                  <span className="text-sm">CHANGE DUE: {gbp(changeDuePence)}</span>
                </div>
              ) : (
                <span>Underpaid by {gbp(totalDuePence - tenderedCashPence)}</span>
              )}
            </div>
          )}

          {/* ON-SCREEN TENDER NUMPAD, FAST CASH & MULTI-TENDER BAR */}
          <div className="p-2 border-t border-white/10 bg-slate-950 space-y-1.5 shrink-0">
            {/* Fast Cash Row */}
            <div className="grid grid-cols-4 gap-1 text-xs">
              <button
                type="button"
                onClick={() => setTenderNumpadValue((totalDuePence / 100).toFixed(2))}
                className="rounded-lg bg-white/10 py-1.5 font-mono text-[11px] font-black text-white hover:bg-white/20 active:scale-95"
              >
                Exact
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickCash(10)}
                className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 py-1.5 font-mono text-[11px] font-black text-emerald-300 hover:bg-emerald-500/30 active:scale-95"
              >
                £10
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickCash(20)}
                className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 py-1.5 font-mono text-[11px] font-black text-emerald-300 hover:bg-emerald-500/30 active:scale-95"
              >
                £20
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickCash(50)}
                className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 py-1.5 font-mono text-[11px] font-black text-emerald-300 hover:bg-emerald-500/30 active:scale-95"
              >
                £50
              </button>
            </div>

            {/* Touch Numpad */}
            <div className="grid grid-cols-6 gap-1 text-xs font-mono">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.', 'C'].map((char) => (
                <button
                  key={char}
                  type="button"
                  onClick={() => handleNumpadPress(char)}
                  className={`rounded-lg py-1.5 font-bold transition active:scale-95 ${
                    char === 'C'
                      ? 'bg-red-950/40 border border-red-500/30 text-red-300 hover:bg-red-900/40'
                      : 'bg-white/5 border border-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  {char}
                </button>
              ))}
            </div>

            {/* 3 Primary Tender Action Buttons: CASH, CARD, SPLIT PAY */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {/* CASH TENDER BUTTON */}
              <button
                type="button"
                disabled={cartLines.length === 0}
                onClick={() => handleCompletePayment('cash')}
                className="rounded-xl bg-emerald-500 py-3 px-1 font-body text-[11px] font-black uppercase tracking-wider text-ink shadow-glow hover:bg-emerald-400 transition active:scale-95 disabled:opacity-30 flex flex-col items-center justify-center gap-0.5"
              >
                <span className="text-base">💵</span>
                <span>CASH &amp; POP</span>
              </button>

              {/* CARD TENDER BUTTON */}
              <button
                type="button"
                disabled={cartLines.length === 0}
                onClick={() => handleCompletePayment('card')}
                className="rounded-xl bg-blue-500 py-3 px-1 font-body text-[11px] font-black uppercase tracking-wider text-white shadow-glow hover:bg-blue-400 transition active:scale-95 disabled:opacity-30 flex flex-col items-center justify-center gap-0.5"
              >
                <span className="text-base">💳</span>
                <span>CARD / SUMUP</span>
              </button>

              {/* SPLIT PAY BUTTON */}
              <button
                type="button"
                disabled={cartLines.length === 0}
                onClick={handleOpenSplitModal}
                className="rounded-xl bg-purple-600 py-3 px-1 font-body text-[11px] font-black uppercase tracking-wider text-white shadow-glow hover:bg-purple-500 transition active:scale-95 disabled:opacity-30 flex flex-col items-center justify-center gap-0.5"
                title="Split bill: some online/card and rest cash"
              >
                <span className="text-base">🔀</span>
                <span>SPLIT PAY</span>
              </button>
            </div>

            {/* Toast POS Fast Utility Strip */}
            <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-white/10 text-[11px] font-bold">
              <button
                type="button"
                disabled={cartLines.length === 0}
                onClick={() => { playPOSTouchTone('tap'); setIsBillSplitModalOpen(true) }}
                className="rounded-xl bg-indigo-500/20 border border-indigo-500/40 py-2 px-1 text-indigo-300 hover:bg-indigo-500/30 transition active:scale-95 disabled:opacity-30 flex flex-col items-center justify-center gap-0.5"
                title="Split bill evenly (2-way, 3-way, 4-way) or by item"
              >
                <span className="text-sm">➗</span>
                <span>Split Bill</span>
              </button>
              <button
                type="button"
                disabled={cartLines.length === 0}
                onClick={() => { playPOSTouchTone('tap'); setIsCompsModalOpen(true) }}
                className="rounded-xl bg-amber-500/20 border border-amber-500/40 py-2 px-1 text-amber-300 hover:bg-amber-500/30 transition active:scale-95 disabled:opacity-30 flex flex-col items-center justify-center gap-0.5"
                title="Manager Comps & Discounts"
              >
                <span className="text-sm">🏷️</span>
                <span>Comps</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  playPOSTouchTone('tap')
                  window.open('/cfd', 'JustSpudsCFD', 'width=1024,height=650')
                }}
                className="rounded-xl bg-teal-500/20 border border-teal-500/40 py-2 px-1 text-teal-300 hover:bg-teal-500/30 transition active:scale-95 flex flex-col items-center justify-center gap-0.5"
                title="Launch Customer Facing Display (CFD) in secondary window"
              >
                <span className="text-sm">📺</span>
                <span>CFD Screen</span>
              </button>
              <button
                type="button"
                onClick={() => { playPOSTouchTone('tap'); setIsFastSearchOpen(true) }}
                className="rounded-xl bg-white/10 border border-white/15 py-2 px-1 text-white/80 hover:bg-white/20 transition active:scale-95 flex flex-col items-center justify-center gap-0.5"
                title="Search menu (Ctrl+K or /)"
              >
                <span className="text-sm">🔍</span>
                <span>Find (/)</span>
              </button>
            </div>

            {/* Reprint Bar */}
            {lastOrder && (
              <div className="pt-1 flex items-center justify-between text-[10px]">
                <button
                  type="button"
                  onClick={() => setReceiptOrder(lastOrder)}
                  className="text-amber-300 hover:underline flex items-center gap-1 font-bold"
                >
                  <span>🖨️</span>
                  <span>Reprint Last Ticket (#{lastOrder.shortId})</span>
                </button>
                {discountPence > 0 && (
                  <button
                    type="button"
                    onClick={handleClearDiscounts}
                    className="text-rose-400 underline font-bold"
                  >
                    Clear Discount
                  </button>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* MODAL: SPLIT PAYMENT (SOME ONLINE/CARD & REST CASH) */}
      {isSplitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-purple-500/50 bg-slate-900 p-6 shadow-2xl space-y-5 text-white font-body">
            <div className="flex items-start justify-between border-b border-white/10 pb-3">
              <div>
                <span className="rounded-md bg-purple-500 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                  Multi-Tender
                </span>
                <h3 className="display text-xl font-black text-white mt-1">Split Payment</h3>
                <p className="text-xs text-white/60">Pay part with Online / Card and the rest with Cash</p>
              </div>
              <button
                type="button"
                onClick={() => setIsSplitModalOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Total Due & Remaining Balance Display */}
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-black/40 p-3 border border-white/10">
                <p className="text-[10px] uppercase font-bold text-white/60">Total Order Amount</p>
                <p className="font-mono text-2xl font-black text-amber-400">{gbp(totalDuePence)}</p>
              </div>

              {(() => {
                const cashP = Math.round(parseFloat(splitCashInput || '0') * 100)
                const cardP = Math.round(parseFloat(splitCardInput || '0') * 100)
                const onlineP = Math.round(parseFloat(splitOnlineInput || '0') * 100)
                const allocated = cashP + cardP + onlineP
                const remaining = totalDuePence - allocated
                const isBalanced = Math.abs(remaining) < 1

                return (
                  <div
                    className={`rounded-2xl p-3 border transition ${
                      isBalanced
                        ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                        : remaining > 0
                        ? 'bg-purple-950/60 border-purple-500/40 text-purple-300'
                        : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    <p className="text-[10px] uppercase font-bold text-white/60">
                      {isBalanced ? 'Status' : remaining > 0 ? 'Remaining to Allocate' : 'Over-Allocated'}
                    </p>
                    <p className="font-mono text-2xl font-black">
                      {isBalanced ? '✓ 100% Balanced' : gbp(Math.abs(remaining))}
                    </p>
                  </div>
                )
              })()}
            </div>

            {/* Quick Split Presets */}
            <div className="space-y-2 pt-1">
              {/* Online + Cash Presets (Some Online, Rest Cash) */}
              <div>
                <span className="text-[10px] uppercase font-bold text-purple-300 block mb-1">
                  🌐 Some Online + 💵 Rest Cash Presets:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const half = (totalDuePence / 200).toFixed(2)
                      const remainder = ((totalDuePence - Math.round(parseFloat(half) * 100)) / 100).toFixed(2)
                      setSplitOnlineInput(half)
                      setSplitCashInput(remainder)
                      setSplitCardInput('0.00')
                      setSplitCustomerCashGiven(remainder)
                    }}
                    className="rounded-xl border border-purple-500/40 bg-purple-500/10 py-1.5 px-3 text-xs font-bold text-purple-200 hover:bg-purple-500/20 active:scale-95"
                  >
                    🌐 50% Online / 💵 50% Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const onlinePortion = 5
                      const rest = Math.max(0, (totalDuePence - 500) / 100).toFixed(2)
                      setSplitOnlineInput(onlinePortion.toFixed(2))
                      setSplitCashInput(rest)
                      setSplitCardInput('0.00')
                      setSplitCustomerCashGiven(rest)
                    }}
                    className="rounded-xl border border-purple-500/40 bg-purple-500/10 py-1.5 px-3 text-xs font-bold text-purple-200 hover:bg-purple-500/20 active:scale-95"
                  >
                    🌐 £5 Online / 💵 Rest Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const onlinePortion = 10
                      const rest = Math.max(0, (totalDuePence - 1000) / 100).toFixed(2)
                      setSplitOnlineInput(onlinePortion.toFixed(2))
                      setSplitCashInput(rest)
                      setSplitCardInput('0.00')
                      setSplitCustomerCashGiven(rest)
                    }}
                    className="rounded-xl border border-purple-500/40 bg-purple-500/10 py-1.5 px-3 text-xs font-bold text-purple-200 hover:bg-purple-500/20 active:scale-95"
                  >
                    🌐 £10 Online / 💵 Rest Cash
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cashPortion = 5
                      const rest = Math.max(0, (totalDuePence - 500) / 100).toFixed(2)
                      setSplitCashInput(cashPortion.toFixed(2))
                      setSplitOnlineInput(rest)
                      setSplitCardInput('0.00')
                      setSplitCustomerCashGiven('5.00')
                    }}
                    className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-1.5 px-3 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20 active:scale-95"
                  >
                    💵 £5 Cash / 🌐 Rest Online
                  </button>
                </div>
              </div>

              {/* Cash + Card Presets */}
              <div>
                <span className="text-[10px] uppercase font-bold text-blue-300 block mb-1">
                  💵 Cash + 💳 Card Presets:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const half = (totalDuePence / 200).toFixed(2)
                      const remainder = ((totalDuePence - Math.round(parseFloat(half) * 100)) / 100).toFixed(2)
                      setSplitCashInput(half)
                      setSplitCardInput(remainder)
                      setSplitOnlineInput('0.00')
                      setSplitCustomerCashGiven(half)
                    }}
                    className="rounded-xl border border-white/10 bg-white/5 py-1.5 px-3 text-xs font-bold text-white hover:bg-white/15 active:scale-95"
                  >
                    50% Cash / 50% Card
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cashPortion = 5
                      const rest = Math.max(0, (totalDuePence - 500) / 100).toFixed(2)
                      setSplitCashInput(cashPortion.toFixed(2))
                      setSplitCardInput(rest)
                      setSplitOnlineInput('0.00')
                      setSplitCustomerCashGiven('5.00')
                    }}
                    className="rounded-xl border border-white/10 bg-white/5 py-1.5 px-3 text-xs font-bold text-white hover:bg-white/15 active:scale-95"
                  >
                    £5 Cash / Rest Card
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const cashPortion = 10
                      const rest = Math.max(0, (totalDuePence - 1000) / 100).toFixed(2)
                      setSplitCashInput(cashPortion.toFixed(2))
                      setSplitCardInput(rest)
                      setSplitOnlineInput('0.00')
                      setSplitCustomerCashGiven('10.00')
                    }}
                    className="rounded-xl border border-white/10 bg-white/5 py-1.5 px-3 text-xs font-bold text-white hover:bg-white/15 active:scale-95"
                  >
                    £10 Cash / Rest Card
                  </button>
                </div>
              </div>
            </div>

            {/* Split Tender Inputs */}
            <div className="space-y-3">
              {/* 1. Cash Portion */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-emerald-300 flex items-center gap-1.5">
                    <span>💵</span>
                    <span>1. Cash Portion (£):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const card = parseFloat(splitCardInput || '0')
                      const online = parseFloat(splitOnlineInput || '0')
                      const rem = Math.max(0, (totalDuePence - Math.round((card + online) * 100)) / 100).toFixed(2)
                      setSplitCashInput(rem)
                      setSplitCustomerCashGiven(rem)
                    }}
                    className="text-[10px] text-emerald-400 underline font-bold"
                  >
                    Set as Remainder
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-white/50 block font-bold">Charge to Cash:</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-emerald-400">£</span>
                      <input
                        type="number"
                        step="0.01"
                        value={splitCashInput}
                        onChange={(e) => {
                          setSplitCashInput(e.target.value)
                          if (!splitCustomerCashGiven) setSplitCustomerCashGiven(e.target.value)
                        }}
                        className="w-full rounded-xl border border-white/10 bg-black/60 pl-8 pr-3 py-2 font-mono text-base font-bold text-white focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-white/50 block font-bold">Customer Handed In:</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-emerald-400">£</span>
                      <input
                        type="number"
                        step="0.01"
                        value={splitCustomerCashGiven}
                        onChange={(e) => setSplitCustomerCashGiven(e.target.value)}
                        placeholder="e.g. 10.00"
                        className="w-full rounded-xl border border-white/10 bg-black/60 pl-8 pr-3 py-2 font-mono text-base font-bold text-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Cash Change Due */}
                {(() => {
                  const reqCash = parseFloat(splitCashInput || '0')
                  const handedIn = parseFloat(splitCustomerCashGiven || '0')
                  const change = handedIn > reqCash ? handedIn - reqCash : 0
                  return change > 0 ? (
                    <p className="text-xs font-black text-emerald-400 pt-1">
                      Cash Change Due: <strong>{gbp(Math.round(change * 100))}</strong>
                    </p>
                  ) : null
                })()}
              </div>

              {/* 2. Card Portion */}
              <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-blue-300 flex items-center gap-1.5">
                    <span>💳</span>
                    <span>2. Card Portion (SumUp / Contactless) (£):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const cash = parseFloat(splitCashInput || '0')
                      const online = parseFloat(splitOnlineInput || '0')
                      const rem = Math.max(0, (totalDuePence - Math.round((cash + online) * 100)) / 100).toFixed(2)
                      setSplitCardInput(rem)
                    }}
                    className="text-[10px] text-blue-400 underline font-bold"
                  >
                    Set as Remainder
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-blue-400">£</span>
                  <input
                    type="number"
                    step="0.01"
                    value={splitCardInput}
                    onChange={(e) => setSplitCardInput(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/60 pl-8 pr-3 py-2 font-mono text-base font-bold text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* 3. Online Link / QR Portion (Optional) */}
              <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-purple-300 flex items-center gap-1.5">
                    <span>🌐</span>
                    <span>3. Online / App / Payment Link (£):</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const cash = parseFloat(splitCashInput || '0')
                      const card = parseFloat(splitCardInput || '0')
                      const rem = Math.max(0, (totalDuePence - Math.round((cash + card) * 100)) / 100).toFixed(2)
                      setSplitOnlineInput(rem)
                    }}
                    className="text-[10px] text-purple-400 underline font-bold"
                  >
                    Set as Remainder
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-purple-400">£</span>
                  <input
                    type="number"
                    step="0.01"
                    value={splitOnlineInput}
                    onChange={(e) => setSplitOnlineInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-white/10 bg-black/60 pl-8 pr-3 py-2 font-mono text-base font-bold text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Complete Split Tender Button */}
            {(() => {
              const cashP = Math.round(parseFloat(splitCashInput || '0') * 100)
              const cardP = Math.round(parseFloat(splitCardInput || '0') * 100)
              const onlineP = Math.round(parseFloat(splitOnlineInput || '0') * 100)
              const allocated = cashP + cardP + onlineP
              const isBalanced = Math.abs(allocated - totalDuePence) < 1

              return (
                <button
                  type="button"
                  disabled={!isBalanced || cartLines.length === 0}
                  onClick={handleCompleteSplitPayment}
                  className="w-full rounded-full bg-purple-600 py-4 font-body text-xs font-black uppercase tracking-wider text-white shadow-glow hover:bg-purple-500 transition active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <span>✓</span>
                  <span>Complete Split Tender &amp; Pop Cash Drawer</span>
                </button>
              )
            })()}
          </div>
        </div>
      )}

      {/* MODAL: FOOD STORE MODIFIER WIZARD */}
      {customizingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl border border-white/20 bg-slate-900 p-5 shadow-2xl space-y-4 text-white font-body my-4">
            <div className="flex items-start justify-between border-b border-white/10 pb-3">
              <div>
                <span className="rounded-md bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase text-ink">
                  {customizingProduct.category}
                </span>
                <h3 className="display text-xl font-black text-white mt-1">{customizingProduct.name}</h3>
                <p className="text-xs text-white/60">{customizingProduct.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setCustomizingProduct(null)}
                className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* STEP 1: BUTTER SELECTION */}
            {customizingProduct.category === 'SPUDS' && (
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-amber-300">
                  1. Butter Choice:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'salted', label: '🧈 Real Butter' },
                    { id: 'garlic', label: '🧄 Garlic Butter' },
                    { id: 'vegan', label: '🌱 Flora Vegan' },
                    { id: 'none', label: '🚫 No Butter' },
                  ].map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setSelectedButter(b.id as any)}
                      className={`rounded-xl py-2.5 px-2 text-xs font-bold border text-center transition ${
                        selectedButter === b.id
                          ? 'bg-amber-400 text-ink border-amber-400 shadow-glow font-black'
                          : 'bg-white/5 text-white border-white/10 hover:bg-white/15'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 2: CONVERSATIONAL MODIFIERS MATRIX (Toast / Square style) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider text-amber-300">
                    2. Conversational Modifiers (Fillings &amp; Toppings):
                  </label>
                  <p className="text-[10px] text-white/50">1-tap standard, extra (+£1), hold (NO), light, or side</p>
                </div>
                <span className="text-[11px] text-amber-400 font-mono font-bold">
                  {Object.keys(conversationalMods).length} customized
                </span>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {[
                  { id: 'Mature Cheddar Cheese', icon: '🧀' },
                  { id: 'Heinz Baked Beans', icon: '🥫' },
                  { id: 'Signature 3-Cheese Blend', icon: '🧀' },
                  { id: 'Tuna Sweetcorn Mayo', icon: '🐟' },
                  { id: 'Chilli Con Carne', icon: '🥩' },
                  { id: 'Homemade Coleslaw', icon: '🥗' },
                  { id: 'Crispy Fried Onions', icon: '🧅' },
                  { id: 'Spicy Jalapeños', icon: '🌶️' },
                  { id: 'Black Sliced Olives', icon: '🫒' },
                ].map(({ id: topping, icon }) => {
                  const currentMod = conversationalMods[topping]
                  return (
                    <div
                      key={topping}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-xl border transition gap-2 ${
                        currentMod
                          ? 'bg-amber-400/10 border-amber-400/50'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-[150px]">
                        <span>{icon}</span>
                        <span className="text-xs font-bold text-white">{topping}</span>
                      </div>

                      {/* 1-Tap Toast Modifier Chips */}
                      <div className="flex items-center gap-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            playPOSTouchTone('tap')
                            setConversationalMods((prev) => {
                              const next = { ...prev }
                              if (next[topping] === 'regular') delete next[topping]
                              else next[topping] = 'regular'
                              return next
                            })
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                            currentMod === 'regular'
                              ? 'bg-emerald-500 text-ink border-emerald-400 font-black shadow'
                              : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/15'
                          }`}
                        >
                          Regular
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            playPOSTouchTone('tap')
                            setConversationalMods((prev) => {
                              const next = { ...prev }
                              if (next[topping] === 'extra') delete next[topping]
                              else next[topping] = 'extra'
                              return next
                            })
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                            currentMod === 'extra'
                              ? 'bg-amber-400 text-ink border-amber-400 font-black shadow-glow'
                              : 'bg-white/5 text-amber-300/80 border-amber-400/30 hover:bg-amber-400/20'
                          }`}
                        >
                          +Extra (+£1)
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            playPOSTouchTone('tap')
                            setConversationalMods((prev) => {
                              const next = { ...prev }
                              if (next[topping] === 'no') delete next[topping]
                              else next[topping] = 'no'
                              return next
                            })
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                            currentMod === 'no'
                              ? 'bg-rose-500 text-white border-rose-400 font-black shadow'
                              : 'bg-white/5 text-rose-300/70 border-white/10 hover:bg-rose-500/20'
                          }`}
                        >
                          NO
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            playPOSTouchTone('tap')
                            setConversationalMods((prev) => {
                              const next = { ...prev }
                              if (next[topping] === 'lite') delete next[topping]
                              else next[topping] = 'lite'
                              return next
                            })
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                            currentMod === 'lite'
                              ? 'bg-sky-500 text-white border-sky-400 font-black shadow'
                              : 'bg-white/5 text-sky-300/70 border-white/10 hover:bg-sky-500/20'
                          }`}
                        >
                          Lite
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            playPOSTouchTone('tap')
                            setConversationalMods((prev) => {
                              const next = { ...prev }
                              if (next[topping] === 'side') delete next[topping]
                              else next[topping] = 'side'
                              return next
                            })
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                            currentMod === 'side'
                              ? 'bg-purple-500 text-white border-purple-400 font-black shadow'
                              : 'bg-white/5 text-purple-300/70 border-white/10 hover:bg-purple-500/20'
                          }`}
                        >
                          Side
                        </button>

                        {currentMod && (
                          <button
                            type="button"
                            onClick={() => {
                              playPOSTouchTone('tap')
                              setConversationalMods((prev) => {
                                const next = { ...prev }
                                delete next[topping]
                                return next
                              })
                            }}
                            className="text-white/40 hover:text-white px-1 text-xs"
                            title="Reset topping"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* STEP 3: HOUSE SAUCES */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-amber-300">
                3. House Sauces (Complimentary):
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'House Spud Special',
                  'Garlic Herb Mayo',
                  'Sweet Hickory BBQ',
                  'Fire Sriracha Chilli',
                  'Sweet Chilli',
                  'Cool Mint Raita',
                ].map((s) => {
                  const isChecked = selectedSauces.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        playPOSTouchTone('tap')
                        setSelectedSauces((prev) =>
                          isChecked ? prev.filter((x) => x !== s) : [...prev, s]
                        )
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold border transition ${
                        isChecked
                          ? 'bg-amber-400 text-ink border-amber-400 font-black shadow'
                          : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/15'
                      }`}
                    >
                      {s} {isChecked && '✓'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* STEP 4: MEAL DEAL UPGRADE */}
            {customizingProduct.mealEligible && (
              <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-black text-xs text-amber-300">Combo Deal Upgrade (+£1.80)</p>
                  <p className="text-[10px] text-white/60">Adds cold drink can + crisps/snack to this order</p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isMealDealCombo}
                    onChange={(e) => setIsMealDealCombo(e.target.checked)}
                    className="h-5 w-5 rounded border-white/20 text-amber-400 focus:ring-amber-400"
                  />
                  <span className="text-xs font-bold">{isMealDealCombo ? 'Deal Added ✓' : 'Add Deal'}</span>
                </div>
              </div>
            )}

            {/* STEP 5: KITCHEN STATION ROUTING & RUSH TICKET */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-white/60">
                  Kitchen Station Routing:
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'spuds', label: '🥔 Oven' },
                    { id: 'grill', label: '🔥 Grill' },
                    { id: 'drinks', label: '🥤 Bar' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        playPOSTouchTone('tap')
                        setSelectedStation(st.id as any)
                      }}
                      className={`rounded-lg py-1.5 text-[11px] font-bold border text-center transition ${
                        selectedStation === st.id
                          ? 'bg-amber-400 text-ink border-amber-400 font-black shadow'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-white/60">
                  Kitchen Priority:
                </label>
                <button
                  type="button"
                  onClick={() => {
                    playPOSTouchTone('tap')
                    setIsRushTicket((prev) => !prev)
                  }}
                  className={`w-full rounded-lg py-1.5 text-[11px] font-bold border transition flex items-center justify-center gap-1.5 ${
                    isRushTicket
                      ? 'bg-rose-600 text-white border-rose-500 font-black shadow animate-pulse'
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                  }`}
                >
                  <span>🔥</span>
                  <span>{isRushTicket ? 'RUSH TICKET (PRIORITY)' : 'Standard Queue'}</span>
                </button>
              </div>
            </div>

            {/* STEP 6: KITCHEN SPEED TAGS */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-white/60">
                Quick Prep Flags:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {['Extra Crispy Skin', 'Well Done', 'Light Butter', 'Separate Box', 'Fork & Napkins Only'].map((tag) => {
                  const isTagged = speedTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        playPOSTouchTone('tap')
                        setSpeedTags((prev) =>
                          isTagged ? prev.filter((t) => t !== tag) : [...prev, tag]
                        )
                      }}
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold border transition ${
                        isTagged
                          ? 'bg-emerald-500 text-ink border-emerald-400 font-black'
                          : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/15'
                      }`}
                    >
                      {tag} {isTagged && '✓'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* CONFIRM & ADD TO TICKET */}
            {(() => {
              const extraCount = Object.values(conversationalMods).filter((m) => m === 'extra').length
              const lineTotalPence = customizingProduct.price + extraCount * 100 + (isMealDealCombo ? 180 : 0)
              return (
                <button
                  type="button"
                  onClick={handleConfirmCustomizer}
                  className="w-full rounded-full bg-amber-400 py-3.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <span>✓</span>
                  <span>Add To Ticket &bull; {gbp(lineTotalPence)}</span>
                </button>
              )
            })()}
          </div>
        </div>
      )}

      {/* MODAL: X-REPORT (MID-DAY SHIFT READING WITHOUT CLOSING) */}
      {isXReportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-amber-400/40 bg-slate-900 p-6 shadow-2xl space-y-5 text-white font-body">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📊</span>
                <div>
                  <h3 className="display text-base font-black text-white">Mid-Day X-Report (Reading)</h3>
                  <p className="text-[10px] text-white/60">Shift #{shift.shiftNumber} &bull; Does not close register</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsXReportOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2 rounded-xl bg-black/40">
                <span className="text-white/70">Starting Cash Float:</span>
                <span className="font-mono font-bold">{gbp(shift.startingFloat)}</span>
              </div>
              <div className="flex justify-between p-2 rounded-xl bg-black/40">
                <span className="text-white/70">In-Store Cash Sales ({shift.inStoreOrdersCount} orders):</span>
                <span className="font-mono font-bold text-emerald-400">+{gbp(shift.cashSalesTotal)}</span>
              </div>
              <div className="flex justify-between p-2 rounded-xl bg-black/40">
                <span className="text-white/70">In-Store Card Sales:</span>
                <span className="font-mono font-bold text-blue-400">{gbp(shift.cardSalesTotal)}</span>
              </div>
              <div className="flex justify-between p-2 rounded-xl bg-black/40">
                <span className="text-white/70">Online Website Orders ({shift.onlineOrdersCount} orders):</span>
                <span className="font-mono font-bold">{gbp(shift.onlineOrdersTotal)}</span>
              </div>
              <div className="flex justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-400/40 text-sm">
                <span className="font-black text-white">Expected Cash in Till:</span>
                <span className="font-mono font-black text-amber-400">{gbp(shift.expectedCash)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerBrowserPrint()
                }}
                className="flex-1 rounded-xl bg-amber-400 py-3 text-xs font-black uppercase text-ink hover:bg-amber-300"
              >
                🖨️ Print X-Report Docket
              </button>
              <button
                type="button"
                onClick={() => setIsXReportOpen(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-white hover:bg-white/15"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Z-REPORT (END OF DAY REGISTER CLOSE & CASH RECONCILIATION) */}
      {isZReportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/90 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border border-rose-500/40 bg-slate-900 p-6 shadow-2xl space-y-4 text-white font-body my-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="display text-lg font-black text-white">End of Day Z-Report Close</h3>
                <p className="text-xs text-white/60">Reconcile cash drawer for Shift #{shift.shiftNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsZReportOpen(false)
                  setBlindCountingConfirmed(false)
                }}
                className="text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-black/50 p-3 border border-white/10">
                <p className="text-[10px] uppercase font-bold text-white/60">Expected Cash</p>
                {tillSettings.blindShiftClose && !blindCountingConfirmed ? (
                  <div>
                    <p className="font-mono text-base font-black text-amber-400">🔒 BLIND CLOSE</p>
                    <p className="text-[9px] text-white/50">Masked for audit compliance</p>
                  </div>
                ) : (
                  <p className="font-mono text-xl font-black text-amber-400">{gbp(shift.expectedCash)}</p>
                )}
              </div>
              <div className="rounded-2xl bg-black/50 p-3 border border-white/10">
                <p className="text-[10px] uppercase font-bold text-white/60">Counted Cash</p>
                <p className="font-mono text-xl font-black text-emerald-400">
                  {gbp(calculateDenominationsTotal(closingDenoms))}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
                Physical Cash Drawer Count:
              </p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { key: 'note50', label: '£50 Notes' },
                  { key: 'note20', label: '£20 Notes' },
                  { key: 'note10', label: '£10 Notes' },
                  { key: 'note5', label: '£5 Notes' },
                  { key: 'coin2', label: '£2 Coins' },
                  { key: 'coin1', label: '£1 Coins' },
                  { key: 'coin50p', label: '50p Coins' },
                  { key: 'coin20p', label: '20p Coins' },
                  { key: 'coin10p', label: '10p Coins' },
                ].map(({ key, label }) => (
                  <div key={key} className="rounded-xl border border-white/10 bg-white/5 p-2">
                    <span className="text-[10px] text-white/60 font-bold block">{label}</span>
                    <input
                      type="number"
                      min={0}
                      value={(closingDenoms as any)[key] || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0
                        setClosingDenoms((prev) => ({ ...prev, [key]: val }))
                      }}
                      className="w-full bg-transparent font-mono text-base font-bold text-white focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Blind Close Verification Banner / Button */}
            {tillSettings.blindShiftClose && !blindCountingConfirmed ? (
              <div className="space-y-2">
                <div className="rounded-2xl bg-amber-500/10 border border-amber-400/30 p-3 text-center text-xs text-amber-200">
                  🛡️ <strong>Blind Shift Close Mode Active:</strong> Expected cash and discrepancy will be calculated after you submit your physical denomination count.
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playPOSTouchTone('action')
                    setBlindCountingConfirmed(true)
                  }}
                  className="w-full rounded-full bg-amber-400 py-3.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition"
                >
                  🔒 Submit Physical Count &amp; Reveal Reconciliation →
                </button>
              </div>
            ) : (
              <>
                {(() => {
                  const counted = calculateDenominationsTotal(closingDenoms)
                  const diff = counted - shift.expectedCash
                  const isBalanced = Math.abs(diff) < 1
                  return (
                    <div
                      className={`rounded-2xl p-3 text-center border text-xs font-black ${
                        isBalanced
                          ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                          : diff > 0
                          ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                          : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      {isBalanced && '✓ Register is Exactly Balanced (£0.00 variance)'}
                      {!isBalanced && diff > 0 && `⚠️ Till is Over: +${gbp(diff)}`}
                      {!isBalanced && diff < 0 && `⚠️ Till is Short: -${gbp(Math.abs(diff))}`}
                    </div>
                  )
                })()}

                <button
                  type="button"
                  onClick={() => {
                    const { closedShift } = closeTillShift(
                      user?.name || 'Store Manager',
                      closingDenoms,
                      closingNotes
                    )
                    setCompletedZReport(closedShift)
                    setIsZReportOpen(false)
                    setBlindCountingConfirmed(false)
                  }}
                  className="w-full rounded-full bg-rose-500 py-3.5 font-body text-xs font-black uppercase tracking-wider text-white shadow-glow hover:bg-rose-400 transition"
                >
                  Lock Till &amp; Print Final Z-Report →
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL: NO SALE / POP CASH DRAWER */}
      {isNoSaleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-slate-900 p-5 shadow-2xl space-y-4 text-white font-body">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="font-bold text-sm text-white">🔓 No Sale / Open Drawer</h3>
              <button type="button" onClick={() => setIsNoSaleModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>
            <p className="text-xs text-white/60">Select audit reason for popping the cash drawer:</p>
            <div className="space-y-2">
              {[
                'Making change for customer',
                'Checking drawer cash float',
                'Coin float refill from safe',
                'Inspection / Manager audit',
              ].map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => {
                    performNoSaleDrawerKick(user?.name || 'Cashier', reason)
                    setIsNoSaleModalOpen(false)
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left text-xs font-bold text-white hover:bg-amber-400 hover:text-ink transition"
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PAY IN / PAY OUT (PETTY CASH) */}
      {isPayInOutModalOpen && (
        <PayInOutModal
          isOpen={isPayInOutModalOpen}
          onClose={() => setIsPayInOutModalOpen(false)}
          staffName={user?.name || 'Cashier'}
        />
      )}

      {/* MODAL: PARKED (HELD) TICKETS */}
      {isParkedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-purple-500/40 bg-slate-900 p-5 shadow-2xl space-y-4 text-white font-body">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="font-bold text-sm text-white">Held Tickets ({parkedOrders.length})</h3>
              <button type="button" onClick={() => setIsParkedModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {parkedOrders.map((p) => (
                <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-xs text-white">{p.customer}</p>
                    <p className="text-[10px] text-white/50">{p.lines.length} items &bull; {p.type} &bull; Held at {p.time}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleResumeParkedTicket(p.id)}
                    className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-black text-ink hover:bg-amber-300"
                  >
                    Recall →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ONLINE ORDERS PENDING QUEUE */}
      {isOnlineOrdersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-rose-500/40 bg-slate-900 p-5 shadow-2xl space-y-4 text-white font-body">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚨</span>
                <h3 className="font-bold text-sm text-white">Incoming Online Orders Queue</h3>
              </div>
              <button type="button" onClick={() => setIsOnlineOrdersModalOpen(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {activeAlerts.map((alert) => (
                <div key={alert.orderId} className="rounded-2xl border border-white/10 bg-black/40 p-3 flex items-center justify-between gap-3">
                  <div>
                    <span className="rounded-md bg-amber-400 px-1.5 py-0.5 font-mono text-[10px] font-black text-ink">
                      #{alert.shortId}
                    </span>
                    <p className="font-bold text-xs text-white mt-1">{alert.customerName} ({gbp(alert.total)})</p>
                    <p className="text-[10px] text-white/60">{alert.itemsSummary}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        updateOrderStatus(alert.orderId, 'accepted')
                        dismissOrderAlert(alert.orderId)
                        triggerBrowserPrint()
                      }}
                      className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-ink hover:bg-emerald-400 shadow"
                    >
                      🖨️ Accept &amp; Print
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissOrderAlert(alert.orderId)}
                      className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-xs text-white/60 hover:text-white"
                    >
                      Mute
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* LINE NOTE MODAL */}
      {isLineNoteModalOpen && selectedLineId && (
        <LineNoteModal
          isOpen={isLineNoteModalOpen}
          onClose={() => setIsLineNoteModalOpen(false)}
          initialNote={cartLines.find((l) => l.lineId === selectedLineId)?.notes || ''}
          onSave={(note) => {
            setCartLines((prev) =>
              prev.map((l) => (l.lineId === selectedLineId ? { ...l, notes: note || undefined } : l))
            )
            setIsLineNoteModalOpen(false)
          }}
        />
      )}

      {/* PRINT THERMAL RECEIPT MODAL */}
      {receiptOrder && (
        <ThermalReceipt
          order={receiptOrder}
          onClose={() => setReceiptOrder(null)}
        />
      )}

      {/* COMPLETED Z-REPORT MODAL */}
      {completedZReport && (
        <ZReportReceipt
          shift={completedZReport}
          onClose={() => setCompletedZReport(null)}
        />
      )}

      {/* MODAL: BILL SPLITTING (TOAST / SQUARE STYLE: EVEN SPLIT OR BY ITEMS) */}
      {isBillSplitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/90 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border border-blue-500/40 bg-slate-900 p-6 shadow-2xl space-y-4 text-white font-body my-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">➗</span>
                <div>
                  <h3 className="display text-lg font-black text-white">Bill Splitting Suite</h3>
                  <p className="text-xs text-white/60">Total Due: <strong className="text-amber-400 font-mono">{gbp(totalDuePence)}</strong></p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBillSplitModalOpen(false)}
                className="text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* TAB 1: EVEN SPLIT (Sequential Guest Payments) */}
            <div className="space-y-3 rounded-2xl bg-black/40 border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-amber-300">1. Even Split by Guests</span>
                <span className="text-[10px] text-white/60">Step {evenSplitPaidSteps} of {evenSplitWays} paid</span>
              </div>

              {/* Number of Ways Selector */}
              <div className="grid grid-cols-4 gap-2">
                {[2, 3, 4, 5].map((ways) => (
                  <button
                    key={ways}
                    type="button"
                    onClick={() => {
                      playPOSTouchTone('tap')
                      setEvenSplitWays(ways)
                      setEvenSplitPaidSteps(0)
                    }}
                    className={`py-2 rounded-xl text-xs font-black border transition ${
                      evenSplitWays === ways
                        ? 'bg-amber-400 text-ink border-amber-400 shadow-glow'
                        : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/15'
                    }`}
                  >
                    {ways}-Way Split
                  </button>
                ))}
              </div>

              <div className="rounded-xl bg-amber-400/10 border border-amber-400/30 p-3 text-center">
                <p className="text-[11px] text-amber-200">Each Guest Portion:</p>
                <p className="font-mono text-2xl font-black text-amber-300">{gbp(evenSplitPortionPence)}</p>
                <p className="text-[10px] text-white/50 mt-1">
                  Remaining after this: {gbp(Math.max(0, totalDuePence - evenSplitPortionPence * (evenSplitPaidSteps + 1)))}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handlePayEvenSplitPortion('cash')}
                  className="rounded-xl bg-emerald-500 py-3 text-xs font-black uppercase text-ink hover:bg-emerald-400 shadow active:scale-95 transition"
                >
                  💵 Pay Portion #{evenSplitPaidSteps + 1} Cash
                </button>
                <button
                  type="button"
                  onClick={() => handlePayEvenSplitPortion('card')}
                  className="rounded-xl bg-blue-500 py-3 text-xs font-black uppercase text-white hover:bg-blue-400 shadow active:scale-95 transition"
                >
                  💳 Pay Portion #{evenSplitPaidSteps + 1} Card
                </button>
              </div>
            </div>

            {/* TAB 2: SPLIT BY ITEMS (Branch lines to separate ticket) */}
            <div className="space-y-3 rounded-2xl bg-black/40 border border-white/10 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-sky-300">2. Split by Items / Seat</span>
                <span className="text-[10px] text-white/60">
                  {selectedSplitLineIds.length} item{selectedSplitLineIds.length === 1 ? '' : 's'} selected
                </span>
              </div>
              <p className="text-[10px] text-white/60">Select items to branch out onto a separate ticket for independent payment:</p>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {cartLines.map((line) => {
                  const isChecked = selectedSplitLineIds.includes(line.lineId!)
                  return (
                    <div
                      key={line.lineId}
                      onClick={() => {
                        playPOSTouchTone('tap')
                        setSelectedSplitLineIds((prev) =>
                          isChecked ? prev.filter((id) => id !== line.lineId) : [...prev, line.lineId!]
                        )
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition text-xs ${
                        isChecked
                          ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                          : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-white/20 text-sky-400"
                        />
                        <span className="font-bold">{line.qty}x {line.name}</span>
                      </div>
                      <span className="font-mono font-bold">{gbp(lineUnitPrice(line) * line.qty)}</span>
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                disabled={selectedSplitLineIds.length === 0 || selectedSplitLineIds.length === cartLines.length}
                onClick={handleCreateSplitTicketFromSelected}
                className={`w-full rounded-full py-3 text-xs font-black uppercase tracking-wider transition ${
                  selectedSplitLineIds.length > 0 && selectedSplitLineIds.length < cartLines.length
                    ? 'bg-sky-400 text-ink hover:bg-sky-300 shadow-glow'
                    : 'bg-white/10 text-white/30 cursor-not-allowed'
                }`}
              >
                🔀 Branch Selected ({selectedSplitLineIds.length}) to New Ticket →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: COMPS & MANAGER DISCOUNTS */}
      {isCompsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl border border-purple-500/40 bg-slate-900 p-6 shadow-2xl space-y-4 text-white font-body">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏷️</span>
                <h3 className="display text-base font-black text-white">Comps &amp; Discounts</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCompsModalOpen(false)}
                className="text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-white/60 block mb-1">
                Mandatory Audit Reason:
              </label>
              <select
                value={compReason}
                onChange={(e) => setCompReason(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-amber-400"
              >
                <option value="Spillage / Food Remake" className="bg-slate-900">Spillage / Food Remake</option>
                <option value="Customer Courtesy / Service Delay" className="bg-slate-900">Customer Courtesy / Service Delay</option>
                <option value="VIP / Owner Courtesy" className="bg-slate-900">VIP / Owner Courtesy</option>
                <option value="Staff Meal Allowance" className="bg-slate-900">Staff Meal Allowance</option>
                <option value="Waste / Texture or Quality Issue" className="bg-slate-900">Waste / Texture or Quality Issue</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleApplyComp(10)}
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-left hover:bg-emerald-500/20 transition"
              >
                <span className="text-xs font-black text-emerald-300 block">10% NHS / Blue</span>
                <span className="text-[10px] text-white/60">Community discount</span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyComp(20)}
                className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-left hover:bg-blue-500/20 transition"
              >
                <span className="text-xs font-black text-blue-300 block">20% Regulars</span>
                <span className="text-[10px] text-white/60">Local business/student</span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyComp(50)}
                className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3 text-left hover:bg-purple-500/20 transition"
              >
                <span className="text-xs font-black text-purple-300 block">50% Staff Meal</span>
                <span className="text-[10px] text-white/60">Shift break allowance</span>
              </button>

              <button
                type="button"
                onClick={() => handleApplyComp(100)}
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-left hover:bg-rose-500/20 transition"
              >
                <span className="text-xs font-black text-rose-300 block">100% Full Comp</span>
                <span className="text-[10px] text-white/60">Manager courtesy (Free)</span>
              </button>
            </div>

            {(discountPercent > 0 || discountFixedPence > 0) && (
              <button
                type="button"
                onClick={handleClearDiscounts}
                className="w-full rounded-xl border border-rose-500/30 bg-rose-500/10 py-2.5 text-xs font-black text-rose-300 hover:bg-rose-500/20 transition"
              >
                ✕ Remove Active Discounts
              </button>
            )}
          </div>
        </div>
      )}

      {/* MODAL: UNIVERSAL FAST SEARCH (Ctrl+K or /) */}
      {isFastSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-3xl border border-amber-400/50 bg-slate-900 p-5 shadow-2xl space-y-4 text-white font-body">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔍</span>
                <div>
                  <h3 className="font-black text-sm text-white">Universal Item Fast Search</h3>
                  <p className="text-[10px] text-white/60">Press ESC or click item to instantly add to ticket</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFastSearchOpen(false)}
                className="text-white/60 hover:text-white"
              >
                ✕
              </button>
            </div>

            <input
              type="text"
              autoFocus
              value={fastSearchInput}
              onChange={(e) => setFastSearchInput(e.target.value)}
              placeholder="Type potato, topping, drink, or panini (e.g. 'chilli', 'coke', 'tuna')..."
              className="w-full rounded-2xl border border-amber-400/40 bg-black/50 px-4 py-3 text-sm font-bold text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />

            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {products
                .filter((p) => {
                  const q = fastSearchInput.toLowerCase().trim()
                  if (!q) return true
                  return (
                    p.name.toLowerCase().includes(q) ||
                    p.category.toLowerCase().includes(q) ||
                    p.description.toLowerCase().includes(q)
                  )
                })
                .slice(0, 10)
                .map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleFastSearchSelect(product)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-amber-400 hover:text-ink transition text-left group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-300 group-hover:text-ink group-hover:bg-amber-300/30">
                          {product.category}
                        </span>
                        <span className="text-xs font-black">{product.name}</span>
                      </div>
                      <p className="text-[10px] text-white/50 group-hover:text-ink/80 line-clamp-1">{product.description}</p>
                    </div>
                    <span className="font-mono text-xs font-black">{gbp(product.price)}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PayInOutModal({
  isOpen,
  onClose,
  staffName,
}: {
  isOpen: boolean
  onClose: () => void
  staffName: string
}) {
  const [type, setType] = useState<'pay_in' | 'pay_out'>('pay_out')
  const [amountInput, setAmountInput] = useState<number>(5)
  const [reason, setReason] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (amountInput <= 0 || !reason.trim()) return
    const pence = Math.round(amountInput * 100)
    recordCashFloatAdjustment(type, pence, reason.trim(), staffName)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-slate-900 p-6 shadow-2xl space-y-4 text-white font-body">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="font-bold text-sm text-white">💵 Cash Float Adjustment</h3>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('pay_out')}
              className={`rounded-xl py-2 font-bold text-xs border ${
                type === 'pay_out' ? 'bg-rose-600 text-white border-rose-500' : 'bg-white/5 border-white/10 text-white/70'
              }`}
            >
              Pay Out (Petty Cash)
            </button>
            <button
              type="button"
              onClick={() => setType('pay_in')}
              className={`rounded-xl py-2 font-bold text-xs border ${
                type === 'pay_in' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-white/5 border-white/10 text-white/70'
              }`}
            >
              Pay In (Float Refill)
            </button>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-white/60">Amount (£):</label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              value={amountInput}
              onChange={(e) => setAmountInput(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-lg font-mono font-bold text-white focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-white/60">Reason / Description:</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Milk & butter from Tesco, coin change..."
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-full bg-amber-400 py-3 font-body text-xs font-black uppercase tracking-wider text-ink hover:bg-amber-300"
          >
            Record &amp; Kick Drawer
          </button>
        </form>
      </div>
    </div>
  )
}

function LineNoteModal({
  isOpen,
  onClose,
  initialNote,
  onSave,
}: {
  isOpen: boolean
  onClose: () => void
  initialNote: string
  onSave: (note: string) => void
}) {
  const [noteText, setNoteText] = useState(initialNote)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl border border-white/20 bg-slate-900 p-5 shadow-2xl space-y-4 text-white font-body">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h3 className="font-bold text-sm text-white">Item Kitchen Note</h3>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white">✕</button>
        </div>

        <input
          type="text"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="e.g. Well done skin, extra crispy..."
          className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none"
          autoFocus
        />

        <div className="flex flex-wrap gap-1">
          {['Extra Crispy', 'Well Done', 'Separate Box', 'Light Butter', 'No Salt'].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setNoteText((prev) => (prev ? `${prev}, ${preset}` : preset))}
              className="rounded-lg bg-white/10 px-2 py-1 text-[10px] text-white/80 hover:bg-white/20"
            >
              +{preset}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onSave(noteText)}
          className="w-full rounded-full bg-amber-400 py-2.5 text-xs font-black uppercase text-ink hover:bg-amber-300"
        >
          Save Note
        </button>
      </div>
    </div>
  )
}
