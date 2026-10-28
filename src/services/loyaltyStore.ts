/**
 * "The Spud Club" — points and a stamp card for online customers.
 *
 * Honest by construction:
 * - everyone starts at zero (no invented balances or spend history);
 * - an order's points are only added once it is collected or delivered, and
 *   dropped if it is cancelled — placing pay-at-counter orders earns nothing;
 * - a reward is a one-off voucher code issued to this customer
 *   ("FREESPUD-7K2Q9M"), used once. The reward names are not public vouchers,
 *   so typing "FREESPUD" at checkout gives nothing.
 *
 * Balances live in this browser. Moving them to the server (so they follow the
 * customer between devices and can't be edited) is the next step.
 */

export interface LoyaltyReward {
  id: string
  title: string
  description: string
  pointsCost: number
  /** Prefix of the voucher codes this reward issues. */
  promoCode: string
  /** What the voucher takes off (pence) and the basket it needs. */
  discountPence: number
  minOrderPence: number
  icon: string
}

export interface RewardVoucher {
  code: string
  rewardId: string
  title: string
  discountPence: number
  minOrderPence: number
  issuedAt: string
  usedAt?: string
  usedOnOrderId?: string
}

export interface LoyaltyState {
  points: number
  /** 0–5; the sixth completed order fills the card and issues a free spud. */
  stamps: number
  completedCards: number
  totalSpentPence: number
  tier: 'BRONZE' | 'SILVER' | 'GOLDEN_VIP'
  vouchers: RewardVoucher[]
  /** Orders placed here, waiting to be collected / delivered before they earn. */
  pending: { orderId: string; pence: number; placedAt: string }[]
  /** Orders already counted, so an order never earns twice. */
  awarded: string[]
}

/** v1 handed every visitor 120 points and an invented spend history; it is discarded. */
const STORAGE_KEY = 'just_spuds_loyalty_v2'
const STAMPS_PER_CARD = 6
const POINTS_PER_POUND = 10

export const AVAILABLE_REWARDS: LoyaltyReward[] = [
  {
    id: 'reward-cheese',
    title: 'Free Extra Melted Mature Cheddar',
    description: 'A generous scoop of melted British cheddar on any spud, wrap or panini.',
    pointsCost: 50,
    promoCode: 'EXTRACHEESE',
    discountPence: 100,
    minOrderPence: 500,
    icon: '🧀',
  },
  {
    id: 'reward-side',
    title: 'Free Homemade Slaw or Crisps',
    description: 'Fresh homemade coleslaw or a bag of Walkers crisps.',
    pointsCost: 80,
    promoCode: 'FREESIDE',
    discountPence: 150,
    minOrderPence: 500,
    icon: '🥗',
  },
  {
    id: 'reward-drink',
    title: 'Free Barista Coffee or Chilled Soda',
    description: 'A hot latte, cappuccino or a cold can with your meal.',
    pointsCost: 90,
    promoCode: 'FREEDRINK',
    discountPence: 275,
    minOrderPence: 500,
    icon: '☕',
  },
  {
    id: 'reward-free-spud',
    title: 'Free Handcrafted King Edward Spud',
    description: 'Any signature jacket potato, on us.',
    pointsCost: 180,
    promoCode: 'FREESPUD',
    discountPence: 650,
    minOrderPence: 650,
    icon: '🥔',
  },
]

/** Reward names that used to be public vouchers; shop promo lists must not contain them. */
export const LOYALTY_REWARD_PREFIXES = AVAILABLE_REWARDS.map((r) => r.promoCode)

const EMPTY: LoyaltyState = {
  points: 0,
  stamps: 0,
  completedCards: 0,
  totalSpentPence: 0,
  tier: 'BRONZE',
  vouchers: [],
  pending: [],
  awarded: [],
}

function load(): LoyaltyState {
  if (typeof window === 'undefined') return { ...EMPTY }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LoyaltyState>
      return {
        ...EMPTY,
        ...parsed,
        vouchers: Array.isArray(parsed.vouchers) ? parsed.vouchers : [],
        pending: Array.isArray(parsed.pending) ? parsed.pending : [],
        awarded: Array.isArray(parsed.awarded) ? parsed.awarded : [],
      }
    }
    localStorage.removeItem('just_spuds_loyalty_v1')
  } catch {}
  return { ...EMPTY }
}

let cachedLoyalty: LoyaltyState = load()
const listeners = new Set<(state: LoyaltyState) => void>()

function save(state: LoyaltyState) {
  cachedLoyalty = state
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {}
  }
  listeners.forEach((l) => l(state))
}

const tierFor = (lifetimePoints: number): LoyaltyState['tier'] => (lifetimePoints >= 500 ? 'GOLDEN_VIP' : lifetimePoints >= 200 ? 'SILVER' : 'BRONZE')

function voucherCode(prefix: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  const bytes = new Uint8Array(6)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes.forEach((b) => (out += alphabet[b % alphabet.length]))
  return `${prefix}-${out}`
}

function issue(state: LoyaltyState, reward: LoyaltyReward): RewardVoucher {
  const voucher: RewardVoucher = {
    code: voucherCode(reward.promoCode),
    rewardId: reward.id,
    title: reward.title,
    discountPence: reward.discountPence,
    minOrderPence: reward.minOrderPence,
    issuedAt: new Date().toISOString(),
  }
  state.vouchers = [voucher, ...state.vouchers].slice(0, 50)
  return voucher
}

export function getLoyaltyState(): LoyaltyState {
  return cachedLoyalty
}

export function subscribeLoyalty(callback: (state: LoyaltyState) => void): () => void {
  listeners.add(callback)
  callback(cachedLoyalty)
  return () => {
    listeners.delete(callback)
  }
}

/** An online order placed in this browser; it earns once it is collected or delivered. */
export function recordLoyaltyOrder(orderId: string, spentPence: number) {
  if (!orderId || spentPence <= 0) return
  const s = getLoyaltyState()
  if (s.awarded.includes(orderId) || s.pending.some((p) => p.orderId === orderId)) return
  save({ ...s, pending: [...s.pending, { orderId, pence: Math.round(spentPence), placedAt: new Date().toISOString() }].slice(-50) })
}

/**
 * Turns pending orders into points and stamps once they are complete; drops
 * cancelled ones. Called with this browser's orders whenever they change.
 */
export function settleLoyaltyFromOrders(orders: { id: string; status: string }[]) {
  const s = getLoyaltyState()
  if (s.pending.length === 0) return
  const byId = new Map(orders.map((o) => [o.id, o]))
  const next: LoyaltyState = { ...s, vouchers: [...s.vouchers], pending: [], awarded: [...s.awarded] }
  let changed = false
  for (const p of s.pending) {
    const order = byId.get(p.orderId)
    if (!order) {
      next.pending.push(p)
      continue
    }
    if (order.status === 'cancelled') {
      changed = true
      continue
    }
    if (order.status !== 'collected' && order.status !== 'delivered') {
      next.pending.push(p)
      continue
    }
    changed = true
    next.awarded = [...next.awarded, p.orderId].slice(-200)
    next.points += Math.floor((p.pence / 100) * POINTS_PER_POUND)
    next.totalSpentPence += p.pence
    next.stamps += 1
    if (next.stamps >= STAMPS_PER_CARD) {
      next.stamps = 0
      next.completedCards += 1
      const freeSpud = AVAILABLE_REWARDS.find((r) => r.id === 'reward-free-spud')
      if (freeSpud) issue(next, freeSpud)
    }
    next.tier = tierFor(Math.floor((next.totalSpentPence / 100) * POINTS_PER_POUND))
  }
  if (changed) save(next)
}

export function redeemReward(rewardId: string): { ok: boolean; promoCode?: string; message: string } {
  const reward = AVAILABLE_REWARDS.find((r) => r.id === rewardId)
  if (!reward) return { ok: false, message: 'Reward not found.' }
  const current = getLoyaltyState()
  if (current.points < reward.pointsCost) {
    return { ok: false, message: `You need ${reward.pointsCost - current.points} more points to claim this reward.` }
  }
  const next: LoyaltyState = { ...current, points: current.points - reward.pointsCost, vouchers: [...current.vouchers] }
  const voucher = issue(next, reward)
  save(next)
  return { ok: true, promoCode: voucher.code, message: `${reward.title} claimed — voucher ${voucher.code} is on your basket.` }
}

/** An unused reward voucher issued in this browser, or undefined. */
export function findRewardVoucher(code: string): RewardVoucher | undefined {
  const clean = code.trim().toUpperCase()
  return getLoyaltyState().vouchers.find((v) => v.code === clean && !v.usedAt)
}

export function markRewardVoucherUsed(code: string, orderId: string) {
  const clean = code.trim().toUpperCase()
  const s = getLoyaltyState()
  if (!s.vouchers.some((v) => v.code === clean && !v.usedAt)) return
  save({ ...s, vouchers: s.vouchers.map((v) => (v.code === clean ? { ...v, usedAt: new Date().toISOString(), usedOnOrderId: orderId } : v)) })
}
