/**
 * Human text for an order line's options. Web and till orders store topping,
 * sauce and meal-deal choices as ids ("spud-special", "cold-coca-cola"); staff
 * screens and receipts used to print those ids as they were.
 */
import { MEAL_DEAL, optionLabel, optionPrice } from '../data/menu'
import type { CartLine, CartLineModifier } from '../hooks/useCart'

const pretty = (id: string) => {
  const label = optionLabel(id)
  if (label !== id) return label
  return id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export interface ExtraPart {
  id: string
  label: string
  count: number
  /** Price of one portion (pence). */
  unit: number
}

/** Paid toppings on a line, grouped: "beans, beans, cheese" → 2× Beans, 1× Cheese. */
export function lineExtras(line: Pick<CartLine, 'extras' | 'category'>): ExtraPart[] {
  const parts: ExtraPart[] = []
  for (const id of line.extras || []) {
    const existing = parts.find((p) => p.id === id)
    if (existing) existing.count += 1
    else parts.push({ id, label: pretty(id), count: 1, unit: optionPrice(id, line.category) })
  }
  return parts
}

export function extrasText(line: Pick<CartLine, 'extras' | 'category'>): string {
  return lineExtras(line)
    .map((p) => (p.count > 1 ? `${p.count}× ${p.label}` : p.label))
    .join(', ')
}

export function saucesText(line: Pick<CartLine, 'sauces'>): string {
  return (line.sauces || []).map(pretty).join(', ')
}

export function saladsText(line: Pick<CartLine, 'salads'>): string {
  return (line.salads || []).map(pretty).join(', ')
}

export const mealDrinkName = (id?: string) => (id ? MEAL_DEAL.drinkOptions.find((d) => d.id === id)?.name || pretty(id) : '')
export const mealSnackName = (id?: string) => (id ? MEAL_DEAL.snackOptions.find((s) => s.id === id)?.name || pretty(id) : '')

export function mealText(line: Pick<CartLine, 'meal' | 'mealDrink' | 'mealSnack'>): string {
  if (!line.meal) return ''
  return [mealDrinkName(line.mealDrink), mealSnackName(line.mealSnack)].filter(Boolean).join(' + ')
}

/** "NO Salt", "EXTRA Cheese", "LITE Mayo", "Gravy ON THE SIDE". */
export function modifierText(m: CartLineModifier): string {
  switch (m.type) {
    case 'no':
      return `NO ${m.name}`
    case 'extra':
      return `EXTRA ${m.name}`
    case 'lite':
      return `LITE ${m.name}`
    case 'side':
      return `${m.name} ON THE SIDE`
    default:
      return m.name
  }
}

export type KitchenStation = 'spuds' | 'grill' | 'pass' | 'drinks'

export const KITCHEN_STATIONS: { id: 'all' | KitchenStation; label: string; shortLabel: string; icon: string }[] = [
  { id: 'all', label: 'All Stations', shortLabel: 'All', icon: '👨‍🍳' },
  { id: 'spuds', label: 'Spud Ovens', shortLabel: 'Ovens', icon: '🥔' },
  { id: 'grill', label: 'Grill & Hot Pass', shortLabel: 'Grill', icon: '🔥' },
  { id: 'pass', label: 'Cold Pass & Deli', shortLabel: 'Cold Pass', icon: '🥗' },
  { id: 'drinks', label: 'Drinks & Front', shortLabel: 'Drinks', icon: '🥤' },
]

/**
 * Resolves the kitchen prep station for any order line, whether placed online
 * (where `line.station` is omitted) or rung up on the counter till.
 */
export function stationForLine(line: Pick<CartLine, 'category' | 'station'>): KitchenStation {
  if (line.station && ['spuds', 'grill', 'pass', 'drinks'].includes(line.station)) {
    return line.station
  }
  switch (line.category) {
    case 'COLD_DRINKS':
    case 'HOT_DRINKS':
    case 'MILKSHAKES_SMOOTHIES':
      return 'drinks'
    case 'BAGUETTES':
    case 'SALADS':
    case 'DESSERTS':
    case 'CRISPS_SNACKS':
      return 'pass'
    case 'PANINIS':
    case 'WRAPS':
    case 'RICE_BOXES':
    case 'CHICKEN_STRIPS':
    case 'HOT_SIDES':
    case 'KIDS_MEALS':
      return 'grill'
    default:
      return 'spuds'
  }
}

