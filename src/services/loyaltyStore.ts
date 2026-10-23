/**
 * Digital Customer Loyalty & Rewards System — "The Spud Club"
 * Drives repeat orders and guest retention modeled after enterprise QSR loyalty programs.
 */

export interface LoyaltyReward {
  id: string
  title: string
  description: string
  pointsCost: number
  promoCode: string
  icon: string
}

export interface LoyaltyState {
  points: number
  stamps: number // 0 to 6 (at 6, user earns a free spud voucher)
  completedCards: number
  totalSpentPence: number
  tier: 'BRONZE' | 'SILVER' | 'GOLDEN_VIP'
}

const STORAGE_KEY = 'just_spuds_loyalty_v1'

export const AVAILABLE_REWARDS: LoyaltyReward[] = [
  {
    id: 'reward-cheese',
    title: 'Free Extra Melted Mature Cheddar',
    description: 'Add a generous scoop of gooey melted British cheddar to any spud, wrap or panini.',
    pointsCost: 50,
    promoCode: 'EXTRACHEESE',
    icon: '🧀',
  },
  {
    id: 'reward-drink',
    title: 'Free Barista Coffee or Chilled Soda',
    description: 'Enjoy a free hot latte, cappuccino, or cold Coca Cola with your meal.',
    pointsCost: 90,
    promoCode: 'FREEDRINK',
    icon: '☕',
  },
  {
    id: 'reward-side',
    title: 'Free Homemade Slaw or Crisps',
    description: 'Fresh crunchy homemade coleslaw or Walkers crisps side.',
    pointsCost: 80,
    promoCode: 'FREESIDE',
    icon: '🥗',
  },
  {
    id: 'reward-free-spud',
    title: 'Free Handcrafted King Edward Spud',
    description: 'Any signature jacket potato with two hearty fillings of your choice.',
    pointsCost: 180,
    promoCode: 'FREESPUD',
    icon: '🥔',
  },
]

function getInitialLoyalty(): LoyaltyState {
  if (typeof window === 'undefined') {
    return { points: 150, stamps: 3, completedCards: 0, totalSpentPence: 2450, tier: 'SILVER' }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}

  // Welcome state for new users: 120 bonus starter points & 2 stamps!
  return {
    points: 120,
    stamps: 2,
    completedCards: 0,
    totalSpentPence: 1850,
    tier: 'BRONZE',
  }
}

let cachedLoyalty: LoyaltyState = getInitialLoyalty()
const listeners = new Set<(state: LoyaltyState) => void>()

function saveLoyalty(state: LoyaltyState) {
  cachedLoyalty = state
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {}
  }
  listeners.forEach((l) => l(state))
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

export function addOrderLoyalty(spentPence: number) {
  const current = getLoyaltyState()
  const pointsEarned = Math.floor(spentPence / 10) // 1 point per 10p (~10 points per £1)
  let newStamps = current.stamps + 1
  let completed = current.completedCards

  if (newStamps >= 6) {
    newStamps = 0
    completed += 1
  }

  const newTotalSpent = current.totalSpentPence + spentPence
  const newPoints = current.points + pointsEarned

  let tier: LoyaltyState['tier'] = 'BRONZE'
  if (newPoints >= 500) tier = 'GOLDEN_VIP'
  else if (newPoints >= 200) tier = 'SILVER'

  saveLoyalty({
    points: newPoints,
    stamps: newStamps,
    completedCards: completed,
    totalSpentPence: newTotalSpent,
    tier,
  })
}

export function redeemReward(rewardId: string): { ok: boolean; promoCode?: string; message: string } {
  const reward = AVAILABLE_REWARDS.find((r) => r.id === rewardId)
  if (!reward) return { ok: false, message: 'Reward not found.' }

  const current = getLoyaltyState()
  if (current.points < reward.pointsCost) {
    return {
      ok: false,
      message: `You need ${reward.pointsCost - current.points} more points to claim this reward.`,
    }
  }

  const updated: LoyaltyState = {
    ...current,
    points: current.points - reward.pointsCost,
  }
  saveLoyalty(updated)
  return {
    ok: true,
    promoCode: reward.promoCode,
    message: `Redeemed ${reward.title}! Coupon code ${reward.promoCode} applied.`,
  }
}
