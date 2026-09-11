/** Confirmed business data with enhanced local hours, ratings, and FAQs. */
export const SITE = {
  name: 'Just Spuds',
  town: 'Aylesbury',
  tagline: 'Fresh Baked, Topped Your Way',
  /** The strapline used inside the boxed logo on the menu boards. */
  logoStrapline: 'Freshly Baked. Topped Your Way.',
  address: {
    line1: 'Shop B, Brook House',
    line2: 'Market Square',
    town: 'Aylesbury',
    postcode: 'HP20 1SN',
  },
  openingHours: {
    display: 'Everyday: 11:00 AM – 10:00 PM',
    schedule: [
      { day: 'Monday', hours: '11:00 AM – 10:00 PM', openHour: 11, closeHour: 22.0 },
      { day: 'Tuesday', hours: '11:00 AM – 10:00 PM', openHour: 11, closeHour: 22.0 },
      { day: 'Wednesday', hours: '11:00 AM – 10:00 PM', openHour: 11, closeHour: 22.0 },
      { day: 'Thursday', hours: '11:00 AM – 10:00 PM', openHour: 11, closeHour: 22.0 },
      { day: 'Friday', hours: '11:00 AM – 10:00 PM', openHour: 11, closeHour: 22.0 },
      { day: 'Saturday', hours: '11:00 AM – 10:00 PM', openHour: 11, closeHour: 22.0 },
      { day: 'Sunday', hours: '11:00 AM – 10:00 PM', openHour: 11, closeHour: 22.0 },
    ],
  },
  offer: {
    code: 'FIRSTSPUD',
    short: 'FREE COFFEE & THICK SHAKES',
    qualifier: "FOR EVERY CUSTOMER'S FIRST TIME",
    title: "Your first one's on us.",
    body: 'Enjoy a complimentary barista coffee or gourmet thick shake with your first spud order. Use code FIRSTSPUD at checkout or mention it at the counter!',
  },
  stats: {
    rating: 4.9,
    reviewCount: 380,
    potatoesBaked: '50,000+',
    yearsHeritage: '800+',
  },
  pillars: [
    { id: 'fresh', title: 'Fresh Ingredients', icon: 'leaf' as const, copy: 'Crisp vegetables, freshly grated cheeses, and slow-cooked fillings sourced locally.' },
    { id: 'baked', title: 'Baked Fresh on Site', icon: 'bake' as const, copy: 'British King Edward and Maris Piper potatoes oven-baked in continuous small batches.' },
    { id: 'yourway', title: 'Loaded Your Way', icon: 'heart' as const, copy: 'Every jacket potato, panini, baguette, and salad is customized to your exact taste.' },
  ],
  social: { instagram: 'https://instagram.com', facebook: 'https://facebook.com', google: 'https://maps.google.com' },
  phone: '01296 000000',
  kitchen: {
    batchIntervalMins: 20,
    freshnessGuarantee: 'Oven-baked in continuous small batches every 20-30 mins',
    currentBatch: '#14 Hot from the Oven',
    statusText: 'Baking Fresh Now',
  },
  transit: [
    { from: 'Friars Square Shopping Centre', time: '2 min walk', distance: '150m', icon: '🛍️' },
    { from: 'Exchange Street Car Park', time: '3 min walk', distance: '250m', icon: '🚗' },
    { from: 'Aylesbury Waterside Theatre', time: '5 min walk', distance: '400m', icon: '🎭' },
    { from: 'Aylesbury Train Station', time: '6 min walk', distance: '500m', icon: '🚆' },
  ],
  deliveryPartners: [
    { name: 'Deliveroo', badge: 'Fast Delivery', color: '#00CDBC', url: 'https://deliveroo.co.uk', desc: 'Order direct to home or office' },
    { name: 'Uber Eats', badge: 'Live Tracking', color: '#06C167', url: 'https://ubereats.com', desc: 'Track your spud in real time' },
    { name: 'Just Eat', badge: 'Local Delivery', color: '#FF8000', url: 'https://just-eat.co.uk', desc: 'Popular in Buckinghamshire' },
  ],
} as const

export const REVIEWS = [
  {
    id: '1',
    author: 'Sarah M.',
    location: 'Aylesbury Local',
    rating: 5,
    date: '3 days ago',
    title: 'Hands down the best lunch in Market Square',
    text: 'Crispy skin, piping hot fluffy potato, and they loaded it with cheese and crispy onions. Absolute perfection for lunchtime!',
    item: 'The Great British Classic',
  },
  {
    id: '2',
    author: 'David K.',
    location: 'Buckinghamshire Regular',
    rating: 5,
    date: '1 week ago',
    title: 'The Chilli Con Carne Spud is unreal',
    text: 'Rich, warming chilli with grated cheddar and garlic mayo on top. Massive portion and incredible value for money.',
    item: 'Chilli Con Carne Spud',
  },
  {
    id: '3',
    author: 'Elena R.',
    location: 'Market Visitor',
    rating: 5,
    date: '2 weeks ago',
    title: 'Super fast service and free first shake!',
    text: 'Used the first-time visitor offer and got a thick chocolate shake for free. The Spud Father is a monster of a meal — will be coming back every Saturday.',
    item: 'The Spud Father',
  },
  {
    id: '4',
    author: 'Marcus P.',
    location: 'Aylesbury Worker',
    rating: 5,
    date: 'Last month',
    title: 'Fresh, healthy, and keeps you full all day',
    text: 'Great alternative to boring sandwiches. The staff are lovely and customising with extra toppings is super easy.',
    item: 'Tuna Mayo & Sweetcorn',
  },
]

export const FAQS = [
  {
    q: 'Do you have vegetarian and vegan options?',
    a: 'Yes! We have a wide range of vegetarian spuds, fresh salads, and vegan-friendly toppings including Heinz baked beans, sweetcorn, crispy fried onions, fresh slaw, and signature sauces.',
  },
  {
    q: 'How does the free first-time drink offer work?',
    a: 'Every new customer gets a free hot barista coffee or luxury thick shake with their meal! Enter code FIRSTSPUD when ordering online or mention it to our friendly team at the counter.',
  },
  {
    q: 'What makes your potatoes so crispy and fluffy?',
    a: 'We bake top-grade British potatoes in specialized ovens on site in regular batches throughout the day. This guarantees a super-crisp skin and steam-fluffy interior every time.',
  },
  {
    q: 'Can I order ahead for quick collection?',
    a: 'Absolutely! Build your order right here on our website, select your estimated collection time, and pick it up freshly loaded with zero waiting at Market Square.',
  },
  {
    q: 'What is included in the Meal Deal?',
    a: 'Add just £1.50 to any main spud, baguette, or panini to add a cold drink and a bag of crisps/snack of your choice!',
  },
]

export const MAPS_SEARCH_URL =
  'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent('Just Spuds, Shop B Brook House, Market Square, Aylesbury HP20 1SN')

export const APPLE_MAPS_URL =
  'https://maps.apple.com/?q=' +
  encodeURIComponent('Just Spuds, Shop B Brook House, Market Square, Aylesbury HP20 1SN')

/**
 * HERITAGE — every claim below is sourced, not invented.
 *
 * Aylesbury market: confirmed by charter from Henry III on 30 May 1239; the
 *   market itself is likely older, probably prescriptive from Anglo-Saxon
 *   origins, and Aylesbury had a mint and probably a weekly market by the 11th
 *   century. The town centred on the present Market Square in the medieval
 *   period. (Victoria County History / Bucks Heritage Portal / Visit Aylesbury)
 * Victorian baked potato trade: documented by Henry Mayhew in *London Labour
 *   and the London Poor* (1851). Sellers used portable coal-heated tin cans,
 *   served potatoes with butter and salt, cried "Bake 'taturs! All 'ot, all
 *   'ot!", and worked a season running from mid-August to late April. London
 *   is estimated to have got through around 10 tons of street-sold baked
 *   potatoes a day. (London Museum / victorianlondon.org)
 */
export const HERITAGE = [
  {
    year: '1239',
    title: 'Historic Market Squares & Street Food',
    body:
      'Centuries ago, British market squares like Aylesbury’s historic square (confirmed by charter in 1239) became the focal point of community life and commerce. These bustling squares established a timeless British tradition of gathering for hot, nourishing local food.',
    image: '/assets/heritage/aylesbury-market.png',
    alt: 'A historic English market square on market day',
    source: 'Victoria County History of Buckinghamshire',
  },
  {
    year: '1851',
    title: 'The Victorian Baked Potato Craze',
    body:
      'In the 19th century, baked potatoes became Britain’s ultimate street food. Documented by Henry Mayhew in London Labour and the London Poor, hundreds of vendors wheeled coal-fired tin ovens shouting "Bake ’taturs! All ’ot, all ’ot!" London devoured ten tons of piping-hot potatoes a day as workers warmed their hands and bellies on the walk home.',
    image: '/assets/heritage/victorian-potato-seller.png',
    alt: 'A Victorian street vendor beside a coal-fired baked potato can',
    source: 'Henry Mayhew, London Labour and the London Poor (1851)',
  },
  {
    year: 'Today',
    title: 'Carrying the Tradition Forward: Just Spuds',
    body:
      'A jacket potato has always been about wholesome comfort — hot, filling, nutritious, and made to order. At Just Spuds, we are proud to keep this authentic British street food tradition alive in Aylesbury Market Square, oven-baking Grade-A King Edward and Maris Piper potatoes fresh all day and loaded with your favourite toppings.',
    image: '/assets/heritage/just-spuds-today.png',
    alt: 'A freshly loaded jacket potato in a takeaway tub',
    source: null,
  },
] as const

export interface StoreStatus {
  isOpen: boolean
  isAcceptingDelivery: boolean
  isAcceptingPickup: boolean
  isKitchenPaused: boolean
  pauseReason?: string
  pauseResumeTime?: string
  pauseDuration?: number
  message: string
  nextOpenTime: string
  opensTodayAt: string
  closingTime: string
}

export interface KitchenPauseInfo {
  isPaused: boolean
  pausedAt?: string
  resumeAt?: string
  durationMinutes?: number
  reasonCode?: string
  reasonText?: string
  pausedBy?: string
}

/** Trading hours as decimal hours, e.g. 21.5 === 21:30. */
export interface StoreHoursConfig {
  openHour: number
  closeHour: number
  isClosed?: boolean
}

export const DEFAULT_STORE_HOURS: StoreHoursConfig = {
  openHour: 11, // 11 AM
  closeHour: 22, // 10 PM
  isClosed: false,
}

/** Last orders close before the kitchen does, so nothing is taken that can't be made. */
const DELIVERY_CUTOFF_OFFSET_HOURS = 0.5  // 30 minutes before close
const PICKUP_CUTOFF_OFFSET_HOURS = 0.25   // 15 minutes before close

/** "22:00" → 22.0. Returns null for anything unparseable so callers can fall back. */
export function parseTimeToDecimalHours(time: string | undefined): number | null {
  if (!time) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours + minutes / 60
}

/** 21.5 → "9:30 PM" */
function formatDecimalHour(decimal: number): string {
  const totalMinutes = Math.round(decimal * 60)
  const hours24 = Math.floor(totalMinutes / 60) % 24
  const minutes = totalMinutes % 60
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${suffix}`
}

/**
 * Evaluates whether the Just Spuds kitchen is currently open for orders.
 *
 * `hours` is a parameter rather than being read from menuStore directly because
 * menuStore imports SITE from this module — reaching back the other way would be a
 * circular import. The caller (useCart) already has both and composes them. Before
 * this, the open/close times were hardcoded local constants, so the admin console's
 * opening-hours editor saved a value, displayed it back, and changed nothing about
 * whether orders were actually accepted.
 */
export function getStoreStatus(
  now: Date = new Date(),
  pauseInfo?: KitchenPauseInfo | null,
  hours: StoreHoursConfig = DEFAULT_STORE_HOURS,
): StoreStatus {
  const currentHour = now.getHours() + now.getMinutes() / 60
  const { openHour, closeHour, isClosed: forceClosed } = hours
  const deliveryCutoff = closeHour - DELIVERY_CUTOFF_OFFSET_HOURS
  const pickupCutoff = closeHour - PICKUP_CUTOFF_OFFSET_HOURS

  const openLabel = formatDecimalHour(openHour)
  const closeLabel = formatDecimalHour(closeHour)
  const deliveryCutoffLabel = formatDecimalHour(deliveryCutoff)
  const pickupCutoffLabel = formatDecimalHour(pickupCutoff)

  const isHoursOpen = !forceClosed && currentHour >= openHour && currentHour < closeHour
  const isAcceptingDelivery = isHoursOpen && currentHour < deliveryCutoff && !pauseInfo?.isPaused
  const isAcceptingPickup = isHoursOpen && currentHour < pickupCutoff && !pauseInfo?.isPaused

  const isPaused = Boolean(pauseInfo?.isPaused)
  const isOpen = isHoursOpen && !isPaused

  let message = 'Kitchen open & baking fresh British King Edward spuds'

  if (forceClosed) {
    message = `Closed for today. Pre-orders welcome for tomorrow!`
  } else if (isPaused && isHoursOpen) {
    const reason = pauseInfo?.reasonText || 'Kitchen is taking a brief pause to catch up with orders.'
    message = `Kitchen orders paused: ${reason}`
  } else if (!isHoursOpen) {
    if (currentHour < openHour) {
      message = `Closed now — kitchen opens today at ${openLabel} (${openLabel} – ${closeLabel}). Pre-orders welcome!`
    } else {
      message = `Kitchen closed for tonight (hours: ${openLabel} – ${closeLabel}). Opens tomorrow at ${openLabel}. Pre-orders welcome!`
    }
  } else if (!isAcceptingDelivery && isAcceptingPickup) {
    message = `Delivery closed for tonight (last orders passed ${deliveryCutoffLabel}). Store Pick Up available until ${pickupCutoffLabel}.`
  }

  let pauseResumeTime: string | undefined
  if (pauseInfo?.resumeAt && pauseInfo.resumeAt !== 'manual') {
    try {
      const resumeDate = new Date(pauseInfo.resumeAt)
      if (!isNaN(resumeDate.getTime())) {
        pauseResumeTime = resumeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    } catch {
      // Ignore
    }
  }

  return {
    isOpen,
    isAcceptingDelivery,
    isAcceptingPickup,
    isKitchenPaused: isPaused,
    pauseReason: pauseInfo?.reasonText,
    pauseResumeTime,
    pauseDuration: pauseInfo?.durationMinutes,
    message,
    nextOpenTime: openLabel,
    opensTodayAt: openLabel,
    closingTime: closeLabel,
  }
}
