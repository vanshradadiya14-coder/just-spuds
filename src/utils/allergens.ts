/**
 * The 14 UK allergens (Natasha's Law / FIC) and how product allergen text maps
 * onto them. Matching errs on the side of caution: when in doubt an item is
 * treated as containing the allergen, never the other way round.
 */
import type { Product } from '../data/menu'

export const UK_14_ALLERGENS = [
  { id: 'gluten', name: 'Gluten (Wheat/Barley)', icon: '🌾' },
  { id: 'dairy', name: 'Milk / Dairy', icon: '🥛' },
  { id: 'egg', name: 'Eggs', icon: '🥚' },
  { id: 'fish', name: 'Fish', icon: '🐟' },
  { id: 'mustard', name: 'Mustard', icon: '🌭' },
  { id: 'celery', name: 'Celery', icon: '🥬' },
  { id: 'sesame', name: 'Sesame', icon: '🥯' },
  { id: 'soya', name: 'Soya', icon: '🌱' },
  { id: 'peanuts', name: 'Peanuts', icon: '🥜' },
  { id: 'nuts', name: 'Tree Nuts', icon: '🌰' },
  { id: 'crustaceans', name: 'Crustaceans', icon: '🦐' },
  { id: 'molluscs', name: 'Molluscs', icon: '🦪' },
  { id: 'lupin', name: 'Lupin', icon: '🌸' },
  { id: 'sulphites', name: 'Sulphites', icon: '🍷' },
] as const

export type AllergenId = (typeof UK_14_ALLERGENS)[number]['id']

const WORDS: Record<AllergenId, string[]> = {
  gluten: ['gluten', 'wheat', 'barley', 'rye', 'oat', 'spelt', 'kamut'],
  dairy: ['dairy', 'milk', 'cheese', 'butter', 'cream', 'yoghurt', 'yogurt', 'lactose', 'whey'],
  egg: ['egg', 'mayo'],
  fish: ['fish', 'tuna', 'salmon', 'anchov', 'cod', 'haddock', 'mackerel'],
  mustard: ['mustard'],
  celery: ['celery', 'celeriac'],
  sesame: ['sesame', 'tahini'],
  soya: ['soya', 'soy', 'edamame', 'tofu'],
  peanuts: ['peanut', 'groundnut'],
  // "nuts" also catches "peanuts" — over-hiding is the safe direction.
  nuts: ['nut', 'almond', 'hazelnut', 'walnut', 'cashew', 'pecan', 'pistachio', 'macadamia', 'praline'],
  crustaceans: ['crustacean', 'prawn', 'shrimp', 'crab', 'lobster', 'langoustine', 'crayfish'],
  molluscs: ['mollusc', 'mussel', 'oyster', 'squid', 'scallop', 'clam', 'octopus', 'whelk'],
  lupin: ['lupin'],
  sulphites: ['sulphite', 'sulfite', 'sulphur dioxide', 'sulfur dioxide'],
}

/** The allergens a product lists, ignoring placeholder entries like "None". */
export function listedAllergens(p: Pick<Product, 'allergens'>): string[] {
  return (p.allergens || []).map((a) => a.trim()).filter((a) => a && !/^(none|n\/a|-)$/i.test(a))
}

/** True when the product has allergen information at all (an explicit "None" counts). */
export function hasAllergenInfo(p: Pick<Product, 'allergens'>): boolean {
  return Array.isArray(p.allergens) && p.allergens.length > 0
}

export function containsAllergen(p: Pick<Product, 'allergens' | 'glutenFree'>, id: AllergenId): boolean {
  if (id === 'gluten' && !p.glutenFree) return true
  const words = WORDS[id]
  return listedAllergens(p).some((a) => {
    const text = a.toLowerCase()
    return words.some((w) => text.includes(w))
  })
}

/**
 * Safe to offer someone avoiding these allergens? Items with no allergen
 * information are never offered as safe.
 */
export function isSafeFor(p: Pick<Product, 'allergens' | 'glutenFree'>, avoid: AllergenId[]): boolean {
  if (avoid.length === 0) return true
  if (!hasAllergenInfo(p)) return false
  return avoid.every((id) => !containsAllergen(p, id))
}
