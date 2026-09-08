/**
 * MENU DATA — transcribed from the in-store menu boards with full nutritional,
 * macro, allergen, and dietary intelligence.
 *
 * Prices are in pence.
 */

export const PRICES_CONFIRMED = true

export const UNCONFIRMED = [
  'One baguette line was taped over on the board and is not listed here.',
  'Sauce prices are not shown on the board; sauces are treated as included.',
] as const

export type CategoryId = string

export interface Category {
  id: CategoryId
  label: string
  blurb?: string
  note?: string
}

export interface Option {
  id: string
  label: string
  price: number
  calories?: number
  protein?: number
  carbs?: number
  fat?: number
  dietary?: string
  allergen?: string
}

export interface Product {
  id: string
  name: string
  category: CategoryId
  description: string
  /** pence */
  price: number
  image: string
  /** Optional GLB. When absent the procedural 3D spud is used. */
  model: string | null
  video: string | null
  extras: string[]
  sauces: boolean
  vegetarian: boolean
  glutenFree?: boolean
  halalFriendly?: boolean
  mealEligible: boolean
  /** Toppings already on the dish — drives the 3D build-up. */
  baseToppings: string[]
  available: boolean
  size?: string
  tags?: string[]
  calories?: number
  protein?: string
  carbs?: string
  fat?: string
  allergens?: string[]
  popular?: boolean
  pairedWith?: string[]
}

export interface ChefPreset {
  id: string
  name: string
  tagline: string
  baseId: string
  category?: CategoryId
  extras: string[]
  sauces: string[]
  badge: string
}

export const CHEF_PRESETS: ChefPreset[] = [
  {
    id: 'market-classic',
    name: 'The Market Classic',
    tagline: 'Garlic butter, 3-cheese blend, rich beans & crispy onions',
    baseId: 'spud-great-british',
    category: 'SPUDS',
    extras: ['coleslaw'],
    sauces: ['spud-special'],
    badge: '★ Best Seller',
  },
  {
    id: 'cheesy-volcano',
    name: 'The Cheesy Volcano',
    tagline: 'Double cheese, baked beans & sriracha kick',
    baseId: 'spud-just-cheese',
    category: 'SPUDS',
    extras: ['three-cheese', 'beans', 'crispy-onions'],
    sauces: ['sriracha'],
    badge: '🔥 Fan Favourite',
  },
  {
    id: 'protein-powerhouse',
    name: 'Protein Powerhouse',
    tagline: 'Loaded pulled chicken, melted cheese & garlic mayo',
    baseId: 'spud-just-chicken',
    category: 'SPUDS',
    extras: ['cheese', 'crispy-onions'],
    sauces: ['mayo', 'bbq'],
    badge: '💪 32g Protein',
  },
  {
    id: 'garden-harvest',
    name: 'Green Harvest Crunch',
    tagline: 'Heinz beans, homemade coleslaw & crispy fried onions',
    baseId: 'spud-just-a',
    category: 'SPUDS',
    extras: ['beans', 'coleslaw', 'crispy-onions'],
    sauces: ['chipotle'],
    badge: '🌿 100% Vegetarian',
  },
  {
    id: 'wrap-peri-deluxe',
    name: 'Peri-Peri Deluxe Wrap',
    tagline: 'Melted cheddar, spicy jalapeños & extra peri-peri drizzle',
    baseId: 'wrap-chicken-periperi',
    category: 'WRAPS',
    extras: ['cheese', 'jalapenos'],
    sauces: ['peri-peri'],
    badge: '🌯 Wrap Special',
  },
  {
    id: 'wrap-steakhouse',
    name: 'Steakhouse Tikka Wrap',
    tagline: 'Extra tikka meat, crispy fried onions & chipotle mayo',
    baseId: 'wrap-lamb-steak',
    category: 'WRAPS',
    extras: ['extra-meat', 'crispy-onions'],
    sauces: ['chipotle'],
    badge: '🔥 Chef Choice',
  },
  {
    id: 'rice-protein-monster',
    name: 'Protein Monster Rice Box',
    tagline: 'Double tikka meat, sautéed peppers & garlic herb mayo',
    baseId: 'rice-box-chicken-periperi',
    category: 'RICE_BOXES',
    extras: ['extra-meat'],
    sauces: ['mayo'],
    badge: '💪 48g Protein',
  },
  {
    id: 'rice-tikka-royale',
    name: 'Lamb Tikka Royale Box',
    tagline: 'Melted cheddar cheese, crunchy slaw & cool mint raita',
    baseId: 'rice-box-lamb-steak',
    category: 'RICE_BOXES',
    extras: ['cheese', 'coleslaw'],
    sauces: ['mint-yoghurt'],
    badge: '👑 Royale Box',
  },
]

export const MEAL_DEAL = {
  price: 195,
  label: 'Make it a Meal Deal',
  detail: 'Add any can of drink (excl. Red Bull & Orange Juice) + any crisps or chocolate for £1.95 extra',
  exclusions: 'Excludes Red Bull and Orange Juice.',
  saving: 'Save up to £1.50',
  drinkOptions: [
    { id: 'cold-coca-cola', name: 'Coca Cola 330ml Can' },
    { id: 'cold-coke-zero', name: 'Coke Zero 330ml Can' },
    { id: 'cold-fanta', name: 'Fanta Orange 330ml Can' },
    { id: 'cold-sprite', name: 'Sprite 330ml Can' },
    { id: 'cold-water', name: 'Still Spring Water 500ml' },
  ],
  snackOptions: [
    { id: 'snack-ready-salted', name: 'Walkers Ready Salted Crisps', type: 'Crisps' },
    { id: 'snack-cheese-onion', name: 'Walkers Cheese & Onion Crisps', type: 'Crisps' },
    { id: 'snack-salt-vinegar', name: 'Walkers Salt & Vinegar Crisps', type: 'Crisps' },
    { id: 'snack-prawn-cocktail', name: 'Walkers Prawn Cocktail Crisps', type: 'Crisps' },
    { id: 'snack-dairy-milk', name: 'Cadbury Dairy Milk Chocolate', type: 'Chocolate' },
    { id: 'snack-snickers', name: 'Snickers Chocolate Bar', type: 'Chocolate' },
    { id: 'snack-mars', name: 'Mars Chocolate Bar', type: 'Chocolate' },
    { id: 'snack-bounty', name: 'Bounty Coconut Chocolate', type: 'Chocolate' },
  ],
} as const

export const ALLERGY_NOTICE =
  'Food images are for illustration only. If you have any food allergies or intolerances, please alert our team before ordering. Common allergens present in kitchen: Dairy, Gluten, Fish, Mustard, Eggs, Celery.'

export const CATEGORIES: Category[] = [
  { id: 'SPUDS', label: 'Spuds', blurb: 'Fluffy British King Edward jackets, baked and loaded to order.' },
  { id: 'WRAPS', label: 'Toasted Wraps', blurb: 'Crispy toasted tortilla wraps packed with sizzling tikka meats, melted cheese & fresh salad.' },
  { id: 'RICE_BOXES', label: 'Rice Boxes', blurb: 'Fragrant seasoned basmati rice loaded with grilled tikka meats, crisp salad & house sauces.' },
  { id: 'BAGUETTES', label: 'Baguettes', blurb: 'Freshly baked artisan crusty baguettes.', note: 'For ultimate freshness, our baguettes are baked and prepared at our location.' },
  { id: 'PANINIS', label: 'Paninis', blurb: 'Hot pressed sourdough ciabatta melts.' },
  { id: 'SALADS', label: 'Salads', blurb: 'Crisp farm fresh bowls, built up with toppings.', note: 'All salad bowls come with lettuce, cucumber, red onion, sweetcorn and crispy onions.' },
  { id: 'HOT_DRINKS', label: 'Hot Drinks', blurb: 'Barista crafted specialty coffees and hot drinks.' },
  { id: 'COLD_DRINKS', label: 'Cold Drinks', blurb: 'Chilled sodas, waters, and thick shakes.' },
  { id: 'SNACKS', label: 'Crisps & Snacks', blurb: 'The crunchy side that makes it a complete meal.' },
]

export const SPUD_EXTRAS: Option[] = [
  { id: 'beans', label: 'Heinz Baked Beans', price: 150, calories: 95, protein: 5, carbs: 18, fat: 0.5, dietary: 'Vegan 🌿', allergen: 'None' },
  { id: 'coleslaw', label: 'Homemade Slaw', price: 150, calories: 120, protein: 1, carbs: 6, fat: 10, dietary: 'Vegetarian 🌿', allergen: 'Egg, Mustard' },
  { id: 'cheese', label: 'Mature Cheddar', price: 150, calories: 155, protein: 9, carbs: 0.5, fat: 13, dietary: 'Vegetarian 🌿', allergen: 'Dairy' },
  { id: 'three-cheese', label: 'Signature 3-Cheese Blend', price: 200, calories: 190, protein: 12, carbs: 1, fat: 16, dietary: 'Vegetarian 🌿', allergen: 'Dairy' },
  { id: 'crispy-onions', label: 'Crispy Fried Onions', price: 100, calories: 65, protein: 1, carbs: 6, fat: 4.5, dietary: 'Vegan 🌿', allergen: 'Gluten' },
]

export const WRAP_EXTRAS: Option[] = [
  { id: 'cheese', label: 'Melted Mature Cheddar', price: 100, calories: 120, protein: 8, carbs: 0.5, fat: 10, dietary: 'Vegetarian 🌿', allergen: 'Dairy' },
  { id: 'extra-meat', label: 'Extra Tikka Meat Portion', price: 200, calories: 160, protein: 22, carbs: 2, fat: 7, dietary: 'High Protein 💪', allergen: 'None' },
  { id: 'crispy-onions', label: 'Crispy Fried Onions', price: 50, calories: 45, protein: 0.5, carbs: 4, fat: 3, dietary: 'Vegan 🌿', allergen: 'Gluten' },
  { id: 'jalapenos', label: 'Spicy Green Jalapeños', price: 50, calories: 10, protein: 0, carbs: 2, fat: 0, dietary: 'Vegan 🌿', allergen: 'None' },
  { id: 'peppers', label: 'Sautéed Bell Peppers', price: 50, calories: 20, protein: 0.5, carbs: 3.5, fat: 0.5, dietary: 'Vegan 🌿', allergen: 'None' },
  { id: 'coleslaw', label: 'Homemade Slaw', price: 80, calories: 80, protein: 1, carbs: 4, fat: 7, dietary: 'Vegetarian 🌿', allergen: 'Egg' },
]

export const RICE_BOX_EXTRAS: Option[] = [
  { id: 'extra-meat', label: 'Extra Grilled Tikka Meat', price: 200, calories: 160, protein: 22, carbs: 2, fat: 7, dietary: 'High Protein 💪', allergen: 'None' },
  { id: 'cheese', label: 'Melted Cheddar Cheese', price: 100, calories: 120, protein: 8, carbs: 0.5, fat: 10, dietary: 'Vegetarian 🌿', allergen: 'Dairy' },
  { id: 'crispy-onions', label: 'Crispy Fried Onions', price: 50, calories: 45, protein: 0.5, carbs: 4, fat: 3, dietary: 'Vegan 🌿', allergen: 'Gluten' },
  { id: 'jalapenos', label: 'Spicy Jalapeños', price: 50, calories: 10, protein: 0, carbs: 2, fat: 0, dietary: 'Vegan 🌿', allergen: 'None' },
  { id: 'coleslaw', label: 'Homemade Slaw Side', price: 80, calories: 80, protein: 1, carbs: 4, fat: 7, dietary: 'Vegetarian 🌿', allergen: 'Egg' },
  { id: 'olives', label: 'Black Olives', price: 50, calories: 25, protein: 0, carbs: 1, fat: 2.5, dietary: 'Vegan 🌿', allergen: 'None' },
]

export const SALAD_EXTRAS: Option[] = [
  { id: 'coleslaw', label: 'Coleslaw', price: 50, calories: 60, protein: 1, carbs: 3, fat: 5, dietary: 'Vegetarian 🌿', allergen: 'Egg' },
  { id: 'jalapenos', label: 'Jalapeños', price: 35, calories: 10, protein: 0, carbs: 2, fat: 0, dietary: 'Vegan 🌿', allergen: 'None' },
  { id: 'olives', label: 'Black Olives', price: 35, calories: 25, protein: 0, carbs: 1, fat: 2.5, dietary: 'Vegan 🌿', allergen: 'None' },
  { id: 'peppers', label: 'Sweet Bell Peppers', price: 35, calories: 15, protein: 0.5, carbs: 3, fat: 0, dietary: 'Vegan 🌿', allergen: 'None' },
  { id: 'gherkins', label: 'Sliced Gherkins', price: 35, calories: 10, protein: 0, carbs: 2, fat: 0, dietary: 'Vegan 🌿', allergen: 'Mustard' },
]

export const BAGUETTE_EXTRAS: Option[] = [
  { id: 'cheese', label: 'Extra Melted Cheese', price: 100, calories: 110, protein: 7, carbs: 0.5, fat: 9, dietary: 'Vegetarian 🌿', allergen: 'Dairy' },
  { id: 'crispy-onions', label: 'Crispy Onions', price: 50, calories: 45, protein: 0.5, carbs: 4, fat: 3, dietary: 'Vegan 🌿', allergen: 'Gluten' },
  { id: 'coleslaw', label: 'Homemade Slaw', price: 80, calories: 80, protein: 1, carbs: 4, fat: 7, dietary: 'Vegetarian 🌿', allergen: 'Egg' },
  { id: 'jalapenos', label: 'Spicy Jalapeños', price: 50, calories: 10, protein: 0, carbs: 2, fat: 0, dietary: 'Vegan 🌿', allergen: 'None' },
]

export const PANINI_EXTRAS: Option[] = [
  { id: 'extra-cheese', label: 'Double Cheese Melt', price: 100, calories: 120, protein: 8, carbs: 0.5, fat: 10, dietary: 'Vegetarian 🌿', allergen: 'Dairy' },
  { id: 'crispy-onions', label: 'Crispy Onions', price: 50, calories: 45, protein: 0.5, carbs: 4, fat: 3, dietary: 'Vegan 🌿', allergen: 'Gluten' },
  { id: 'jalapenos', label: 'Spicy Jalapeños', price: 50, calories: 10, protein: 0, carbs: 2, fat: 0, dietary: 'Vegan 🌿', allergen: 'None' },
]

export const SAUCES: Option[] = [
  { id: 'ketchup', label: 'Tomato Ketchup', price: 0, calories: 20, protein: 0, carbs: 5, fat: 0, dietary: 'Vegan 🌿', allergen: 'Celery' },
  { id: 'mayo', label: 'Garlic Herb Mayo', price: 0, calories: 60, protein: 0.5, carbs: 1, fat: 6.5, dietary: 'Vegetarian 🌿', allergen: 'Egg, Mustard' },
  { id: 'chipotle', label: 'Smoky Chipotle Mayo', price: 0, calories: 55, protein: 0.5, carbs: 1.5, fat: 5.5, dietary: 'Vegetarian 🌿', allergen: 'Egg' },
  { id: 'bbq', label: 'Sweet Hickory BBQ', price: 0, calories: 30, protein: 0, carbs: 7, fat: 0, dietary: 'Vegan 🌿', allergen: 'None' },
  { id: 'sriracha', label: 'Fire Sriracha Chilli', price: 0, calories: 15, protein: 0, carbs: 3, fat: 0, dietary: 'Vegan 🌿', allergen: 'None' },
  { id: 'mint-yoghurt', label: 'Cool Mint Raita Sauce', price: 0, calories: 35, protein: 1.5, carbs: 2, fat: 2, dietary: 'Vegetarian 🌿', allergen: 'Dairy' },
  { id: 'peri-peri', label: 'Fiery Peri-Peri Tikka Drizzle', price: 0, calories: 25, protein: 0.5, carbs: 2.5, fat: 1.5, dietary: 'Vegetarian 🌿', allergen: 'Mustard' },
  { id: 'spud-special', label: 'House Spud Special', price: 0, calories: 45, protein: 0.5, carbs: 3, fat: 3.5, dietary: 'Vegetarian 🌿', allergen: 'Mustard' },
]

export const FRESH_SALAD_OPTIONS: Option[] = [
  { id: 'salad-lettuce', label: 'Crisp Lettuce 🥬', price: 0, calories: 5, protein: 0.5, carbs: 1, fat: 0, dietary: 'Vegan 🌿' },
  { id: 'salad-cucumber', label: 'Sliced Cucumber 🥒', price: 0, calories: 5, protein: 0.3, carbs: 1, fat: 0, dietary: 'Vegan 🌿' },
  { id: 'salad-tomatoes', label: 'Vine Tomatoes 🍅', price: 0, calories: 10, protein: 0.5, carbs: 2, fat: 0.1, dietary: 'Vegan 🌿' },
  { id: 'salad-red-onion', label: 'Red Onion 🧅', price: 0, calories: 10, protein: 0.3, carbs: 2.5, fat: 0, dietary: 'Vegan 🌿' },
  { id: 'salad-sweetcorn', label: 'Sweetcorn 🌽', price: 0, calories: 25, protein: 1, carbs: 5, fat: 0.4, dietary: 'Vegan 🌿' },
  { id: 'salad-jalapenos', label: 'Pickled Jalapeños 🌶️', price: 0, calories: 10, protein: 0.2, carbs: 1.5, fat: 0.1, dietary: 'Vegan 🌿' },
  { id: 'salad-crispy-onions', label: 'Crispy Fried Onions 🧅', price: 0, calories: 35, protein: 0.5, carbs: 3, fat: 2.5, dietary: 'Vegan 🌿' },
  { id: 'salad-gherkins', label: 'Sliced Pickles 🥒', price: 0, calories: 5, protein: 0.2, carbs: 1, fat: 0, dietary: 'Vegan 🌿' },
]

export const NUTRITION_MAP: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {
  'salad-lettuce': { calories: 5, protein: 0.5, carbs: 1, fat: 0 },
  'salad-cucumber': { calories: 5, protein: 0.3, carbs: 1, fat: 0 },
  'salad-tomatoes': { calories: 10, protein: 0.5, carbs: 2, fat: 0.1 },
  'salad-red-onion': { calories: 10, protein: 0.3, carbs: 2.5, fat: 0 },
  'salad-sweetcorn': { calories: 25, protein: 1, carbs: 5, fat: 0.4 },
  'salad-jalapenos': { calories: 10, protein: 0.2, carbs: 1.5, fat: 0.1 },
  'salad-crispy-onions': { calories: 35, protein: 0.5, carbs: 3, fat: 2.5 },
  'salad-gherkins': { calories: 5, protein: 0.2, carbs: 1, fat: 0 },
  'beans': { calories: 95, protein: 5, carbs: 18, fat: 0.5 },
  'coleslaw': { calories: 120, protein: 1, carbs: 6, fat: 10 },
  'cheese': { calories: 155, protein: 9, carbs: 0.5, fat: 13 },
  'three-cheese': { calories: 190, protein: 12, carbs: 1, fat: 16 },
  'extra-cheese': { calories: 120, protein: 8, carbs: 0.5, fat: 10 },
  'extra-meat': { calories: 160, protein: 22, carbs: 2, fat: 7 },
  'crispy-onions': { calories: 65, protein: 1, carbs: 6, fat: 4.5 },
  'jalapenos': { calories: 10, protein: 0, carbs: 2, fat: 0 },
  'olives': { calories: 25, protein: 0, carbs: 1, fat: 2.5 },
  'peppers': { calories: 15, protein: 0.5, carbs: 3, fat: 0 },
  'gherkins': { calories: 10, protein: 0, carbs: 2, fat: 0 },
}

const F = '/assets/food'
const D = '/assets/drinks'

const spud = (
  id: string, name: string, price: number, description: string,
  baseToppings: string[], vegetarian: boolean, glutenFree: boolean, image: string,
  calories: number, protein: string, carbs: string, fat: string,
  allergens: string[], popular = false, tags: string[] = [], pairedWith: string[] = []
): Product => ({
  id, name, category: 'SPUDS', description, price,
  image: `${F}/spuds/${image}.png`,
  model: null, video: null,
  extras: SPUD_EXTRAS.map((e) => e.id),
  sauces: true, vegetarian, glutenFree, halalFriendly: true, mealEligible: true,
  baseToppings, available: true,
  calories, protein, carbs, fat, allergens, popular,
  tags: [
    ...(vegetarian ? ['Vegetarian 🌿'] : []),
    ...(glutenFree ? ['Gluten-Free 🌾'] : []),
    'British Potato 🥔',
    ...tags,
  ],
  pairedWith: pairedWith.length > 0 ? pairedWith : ['cold-coca-cola', 'hot-latte', 'snack-cheese-onion'],
})

export const PRODUCTS: Product[] = [
  spud('spud-just-a', "Just 'A' Spud", 445,
    'A steaming fluffy British King Edward jacket potato with farmhouse butter, sea salt and freshly cracked black pepper.',
    ['butter'], true, true, 'just-a-spud', 380, '7g', '64g', '11g',
    ['Dairy'], false, ['Under £5 🏷️', 'Light & Simple', 'Under 400 kcal'],
    ['hot-flat-white', 'cold-water']),

  spud('spud-great-british', 'The Great British Classic', 695,
    'A fluffy hot jacket potato loaded with garlic butter, our signature three cheese blend, rich Heinz baked beans and crispy golden onions.',
    ['butter', 'three-cheese', 'beans', 'crispy-onions'], true, false, 'great-british-classic', 620, '24g', '72g', '26g',
    ['Dairy', 'Gluten'], true, ['Signature ⭐', 'Best Seller 🔥', 'High Protein 💪'],
    ['cold-coca-cola', 'snack-ready-salted']),

  spud('spud-just-cheese', 'Just Cheese', 545,
    'A fluffy hot jacket potato with farmhouse butter, sea salt, loaded with our signature melted British mature cheddar.',
    ['butter', 'cheese'], true, true, 'just-cheese', 490, '18g', '64g', '19g',
    ['Dairy'], false, ['Classic Melt', 'Gluten-Free 🌾'],
    ['cold-coke-zero', 'snack-salt-vinegar']),

  spud('spud-father', 'The Spud Father', 695,
    'A fluffy hot jacket potato with butter, loaded with melted cheddar, homemade creamy coleslaw and our famous Just Spud signature sauce.',
    ['butter', 'cheese', 'coleslaw', 'spud-sauce'], true, false, 'spud-father', 640, '19g', '68g', '31g',
    ['Dairy', 'Egg', 'Mustard'], true, ['House Special ⭐', 'Loaded Favourite'],
    ['cold-fanta', 'snack-dairy-milk']),

  spud('spud-tuna-mayo', 'Tuna Mayo & Sweetcorn', 545,
    'A fluffy hot jacket potato loaded with flaky skipjack tuna, creamy mayo, sweetcorn, and cracked black pepper.',
    ['butter', 'tuna'], false, true, 'tuna-mayo', 510, '28g', '63g', '16g',
    ['Dairy', 'Fish', 'Egg'], false, ['High Protein 💪', 'Omega-3 Rich', 'Gluten-Free 🌾'],
    ['cold-water', 'hot-americano']),

  spud('spud-chilli', 'Chilli Con Carne Spud', 695,
    'A fluffy hot jacket potato loaded with slow-simmered minced beef chilli con carne, red kidney beans, and cheddar melt.',
    ['butter', 'chilli'], false, true, 'chilli-con-carne', 590, '26g', '70g', '22g',
    ['Dairy', 'Celery'], true, ['Hot & Hearty 🔥', 'High Protein 💪', 'Spicy Kick'],
    ['cold-coca-cola', 'hot-cappuccino']),

  spud('spud-just-chicken', 'Just Pulled Chicken', 595,
    'A fluffy hot jacket potato loaded with tender slow-cooked pulled chicken breast and farmhouse melted butter.',
    ['butter', 'pulled-chicken'], false, true, 'just-chicken', 530, '31g', '63g', '15g',
    ['Dairy'], false, ['High Protein 💪', 'Lean & Hearty', 'Gluten-Free 🌾'],
    ['cold-sprite', 'hot-latte']),

  ...([
    ['baguette-plain-chicken', 'Plain Chicken Baguette', 'plain-chicken',
      'Sliced roast chicken breast with crisp romaine lettuce in a crusty French baguette.', 460, '26g', '58g', '12g', ['Gluten']],
    ['baguette-chicken-mayo', 'Chicken Mayo Baguette', 'chicken-mayo',
      'Creamy chicken mayonnaise with shredded lettuce in a fresh artisan crusty baguette.', 520, '24g', '58g', '21g', ['Gluten', 'Egg', 'Mustard']],
    ['baguette-chicken-tikka', 'Chicken Tikka Mayo Baguette', 'chicken-tikka',
      'Aromatic spiced chicken tikka with creamy mayo and lettuce in a crusty baguette.', 540, '25g', '60g', '22g', ['Gluten', 'Egg', 'Mustard']],
    ['baguette-coronation', 'Coronation Chicken Baguette', 'coronation',
      'Tender coronation chicken in a mild mango-curried dressing with crisp greens.', 530, '23g', '62g', '20g', ['Gluten', 'Egg', 'Mustard']],
    ['baguette-bbq-chicken', 'Sticky BBQ Chicken Baguette', 'bbq-chicken',
      'Succulent pulled chicken in a rich smoky barbecue glaze with crisp lettuce.', 510, '24g', '66g', '14g', ['Gluten']],
    ['baguette-tuna-mayo', 'Tuna Mayo Baguette', 'tuna-mayo',
      'Flaked tuna mayonnaise with crisp shredded lettuce in a freshly baked baguette.', 480, '25g', '57g', '16g', ['Gluten', 'Fish', 'Egg']],
    ['baguette-tuna-crunch', 'Tuna Crunch Baguette', 'tuna-crunch',
      'Tuna mayonnaise with sweetcorn, diced cucumber and peppers for delicious crunch.', 490, '24g', '59g', '17g', ['Gluten', 'Fish', 'Egg']],
  ] as const).map<Product>(([id, name, slug, description, cal, prot, carb, fat, allerg]) => ({
    id, name, category: 'BAGUETTES',
    description,
    price: 425,
    image: `${F}/baguette/${slug}.png`,
    model: null, video: null, extras: BAGUETTE_EXTRAS.map((e) => e.id), sauces: true,
    vegetarian: false, glutenFree: false, halalFriendly: true, mealEligible: true,
    baseToppings: [], available: true,
    calories: cal, protein: prot, carbs: carb, fat, allergens: [...allerg],
    tags: ['Artisan Crust 🥖', 'Baked Fresh Daily', 'High Protein 💪'],
    pairedWith: ['cold-coca-cola', 'snack-ready-salted', 'hot-latte'],
  })),

  ...([
    ['wrap-chicken-periperi', 'Chicken Peri-Peri Tikka Wrap', 'chicken-periperi-tikka-wrap',
      'Golden toasted tortilla wrap filled with juicy chargrilled peri-peri tikka chicken, crisp salad, and creamy peri-peri sauce.', 640, '36g', '58g', '24g', ['Gluten', 'Dairy', 'Mustard', 'Egg'], true],
    ['wrap-lamb-steak', 'Lamb Steak Tikka Wrap', 'lamb-steak-tikka-wrap',
      'Succulent spiced tender lamb steak strips, melted cheddar, fresh coriander, pickled red onions and cool mint raita in a toasted wrap.', 680, '38g', '56g', '28g', ['Gluten', 'Dairy'], true],
    ['wrap-beef-steak', 'Beef Steak Tikka Wrap', 'beef-steak-tikka-wrap',
      'Charred seasoned beef steak slices, sautéed bell peppers, crispy onions and smoky chipotle tikka sauce in a hot pressed wrap.', 660, '37g', '57g', '26g', ['Gluten', 'Dairy'], false],
  ] as const).map<Product>(([id, name, slug, description, cal, prot, carb, fat, allerg, pop]) => ({
    id, name, category: 'WRAPS',
    description,
    price: 799,
    image: `${F}/wraps/${slug}.png`,
    model: null, video: null,
    extras: WRAP_EXTRAS.map((e) => e.id),
    sauces: true, vegetarian: false, glutenFree: false, halalFriendly: true, mealEligible: true,
    baseToppings: [], available: true,
    calories: cal, protein: prot, carbs: carb, fat, allergens: [...allerg],
    popular: pop,
    tags: ['Toasted Wrap 🌯', 'High Protein 💪', 'Halal Friendly 🌙', 'Fresh Off the Grill 🔥'],
    pairedWith: ['cold-coca-cola', 'snack-ready-salted', 'hot-latte'],
  })),

  ...([
    ['rice-box-chicken-periperi', 'Chicken Peri-Peri Tikka Rice Box', 'chicken-periperi-tikka-rice-box',
      'Fragrant turmeric basmati rice topped with chargrilled chicken peri-peri tikka chunks, fresh crunchy salad, sweetcorn, and peri-peri drizzle.', 620, '42g', '74g', '16g', ['Gluten', 'Mustard'], true],
    ['rice-box-lamb-steak', 'Lamb Steak Tikka Rice Box', 'lamb-steak-tikka-rice-box',
      'Tender spiced lamb steak slices on a bed of seasoned basmati rice, with diced tomato cucumber salad, and cool mint raita dressing.', 660, '44g', '72g', '20g', ['Dairy'], true],
    ['rice-box-beef-steak', 'Beef Steak Tikka Rice Box', 'beef-steak-tikka-rice-box',
      'Juicy grilled beef steak strips, caramelised onions, roasted sweet peppers and smoky tikka sauce served over aromatic basmati rice.', 650, '43g', '73g', '19g', ['Gluten'], false],
  ] as const).map<Product>(([id, name, slug, description, cal, prot, carb, fat, allerg, pop]) => ({
    id, name, category: 'RICE_BOXES',
    description,
    price: 799,
    image: `${F}/rice-bowl/${slug}.png`,
    model: null, video: null,
    extras: RICE_BOX_EXTRAS.map((e) => e.id),
    sauces: true, vegetarian: false, glutenFree: true, halalFriendly: true, mealEligible: true,
    baseToppings: [], available: true,
    calories: cal, protein: prot, carbs: carb, fat, allergens: [...allerg],
    popular: pop,
    tags: ['Rice Box 🍚', 'High Protein 💪', 'Gluten-Free Friendly 🌾', 'Gym Fuel ⚡'],
    pairedWith: ['cold-coke-zero', 'snack-cheese-onion', 'cold-water'],
  })),

  ...([
    ['panini-pulled-chicken', 'Pulled Chicken & Cheese Panini', false, 'pulled-chicken',
      'Tender pulled chicken and melting mozzarella, pressed golden on sourdough ciabatta.', 580, '29g', '52g', '26g', ['Gluten', 'Dairy'], true],
    ['panini-tuna-cheese', 'Tuna Melt Panini', false, 'tuna-cheese',
      'Flaked tuna and molten cheddar, pressed hot with dark grill marks.', 540, '27g', '50g', '24g', ['Gluten', 'Dairy', 'Fish'], false],
    ['panini-cheese-tomato', 'Cheese & Tomato Melt Panini', true, 'cheese-tomato',
      'Rich mature cheese and sweet vine tomatoes, pressed hot and crispy.', 460, '16g', '52g', '20g', ['Gluten', 'Dairy'], false],
  ] as const).map<Product>(([id, name, veg, slug, description, cal, prot, carb, fat, allerg, pop]) => ({
    id, name, category: 'PANINIS',
    description,
    price: 395,
    image: `${F}/panini/${slug}.png`,
    model: null, video: null, extras: PANINI_EXTRAS.map((e) => e.id), sauces: true,
    vegetarian: veg, glutenFree: false, halalFriendly: true, mealEligible: true,
    baseToppings: [], available: true,
    calories: cal, protein: prot, carbs: carb, fat, allergens: [...allerg],
    popular: pop,
    tags: [...(veg ? ['Vegetarian 🌿'] : []), 'Hot Pressed 🔥', 'Under £4 🏷️', 'Melting Cheese 🧀'],
    pairedWith: ['cold-coke-zero', 'snack-cheese-onion', 'hot-cappuccino'],
  })),

  ...([
    ['salad-just', 'Just Salad Bowl', 449, true, true, 'just-salad',
      'Crisp romaine, cucumber, red onion, sweetcorn, vine tomatoes and crunchy crispy onions.', 210, '6g', '28g', '8g', ['Gluten']],
    ['salad-tuna', 'Tuna Salad Bowl', 449, false, true, 'tuna-salad',
      'Crisp romaine, cucumber, red onion, sweetcorn, and protein-packed skipjack tuna mayo.', 380, '24g', '26g', '19g', ['Fish', 'Egg', 'Gluten']],
    ['salad-chicken', 'Grilled Chicken Salad Bowl', 549, false, true, 'chicken-salad',
      'Tossed salad greens, sweetcorn, tomatoes, and tender grilled chicken breast slices.', 360, '28g', '24g', '14g', ['Gluten']],
  ] as const).map<Product>(([id, name, price, veg, gf, slug, description, cal, prot, carb, fat, allerg]) => ({
    id, name, category: 'SALADS',
    description,
    price,
    image: `${F}/salad/${slug}.png`,
    model: null, video: null,
    extras: SALAD_EXTRAS.map((e) => e.id),
    sauces: true, vegetarian: veg, glutenFree: gf, halalFriendly: true, mealEligible: true,
    baseToppings: [], available: true,
    calories: cal, protein: prot, carbs: carb, fat, allergens: [...allerg],
    tags: [...(veg ? ['Vegetarian 🌿'] : []), 'Low Calorie 🥗', 'Fresh Greens', 'High Protein 💪'],
    pairedWith: ['cold-water', 'hot-flat-white'],
  })),

  ...([
    ['hot-cappuccino', 'Barista Cappuccino', 275, 'Rich espresso with silky foamed milk and cocoa dust.', 120, '6g', '9g', '6g', ['Dairy']],
    ['hot-latte', 'Barista Latte', 275, 'Double espresso with smooth steamed whole milk.', 150, '8g', '11g', '7g', ['Dairy']],
    ['hot-flat-white', 'Flat White', 275, 'Velvety micro-foam poured over a double ristretto shot.', 110, '6g', '8g', '6g', ['Dairy']],
    ['hot-americano', 'Americano', 275, 'Long black coffee with rich crema.', 10, '1g', '1g', '0g', ['None']],
    ['hot-cortado', 'Cortado', 250, 'Equal parts rich espresso and warm steamed milk.', 70, '4g', '5g', '3.5g', ['Dairy']],
    ['hot-espresso', 'Espresso', 250, 'Intense single origin espresso shot.', 5, '0.5g', '1g', '0g', ['None']],
    ['hot-chocolate', 'Gourmet Hot Chocolate', 275, 'Velvety Belgian hot chocolate with steamed milk.', 240, '7g', '28g', '10g', ['Dairy']],
    ['hot-tea', 'English Breakfast Tea', 275, 'Freshly brewed premium British tea with milk.', 30, '1g', '3g', '1g', ['Dairy']],
  ] as const).map<Product>(([id, name, price, description, cal, prot, carb, fat, allerg]) => ({
    id, name, category: 'HOT_DRINKS',
    description,
    price,
    image: `${D}/coffee/coffee-promo.png`,
    model: null, video: null, extras: [], sauces: false,
    vegetarian: true, glutenFree: true, halalFriendly: true, mealEligible: false,
    baseToppings: [], available: true,
    calories: cal, protein: prot, carbs: carb, fat, allergens: [...allerg],
    tags: ['Barista Crafted ☕', 'Freshly Brewed'],
    pairedWith: ['spud-great-british', 'snack-dairy-milk'],
  })),

  ...([
    ['cold-coca-cola', 'Coca Cola', 150, '330ml Can', 'coca-cola', 139, '0g', '35g', '0g', ['None']],
    ['cold-coke-zero', 'Coke Zero', 150, '330ml Can (Zero Sugar)', 'coke-zero', 1, '0g', '0g', '0g', ['None']],
    ['cold-fanta', 'Fanta Orange', 150, '330ml Can', 'fanta', 130, '0g', '32g', '0g', ['None']],
    ['cold-sprite', 'Sprite', 150, '330ml Can', 'sprite', 120, '0g', '30g', '0g', ['None']],
    ['cold-orange-juice', 'Orange Juice', 225, '250ml Fresh Juice', 'orange-juice', 110, '2g', '24g', '0g', ['None']],
    ['cold-water', 'Spring Water', 150, '500ml Chilled Bottle', 'spring-water', 0, '0g', '0g', '0g', ['None']],
    ['cold-fruit-shoot', 'Fruit Shoot', 140, '200ml Kids Juice', 'orange-juice', 40, '0g', '10g', '0g', ['None']],
    ['cold-red-bull', 'Red Bull Energy', 250, '250ml Can', 'red-bull', 115, '0g', '27g', '0g', ['None']],
  ] as const).map<Product>(([id, name, price, size, imgSlug, cal, prot, carb, fat, allerg]) => ({
    id, name, category: 'COLD_DRINKS', description: size, price, size,
    image: `${D}/${imgSlug}.png`,
    model: null, video: null, extras: [], sauces: false,
    vegetarian: true, glutenFree: true, halalFriendly: true, mealEligible: false,
    baseToppings: [], available: true,
    calories: cal, protein: prot, carbs: carb, fat, allergens: [...allerg],
    tags: ['Chilled ❄️', 'Cold Drink'],
    pairedWith: ['spud-great-british', 'baguette-plain-chicken'],
  })),

  ...([
    ['snack-ready-salted', 'Walkers Ready Salted Crisps', 150, 160, '2g', '16g', '10g', ['None']],
    ['snack-salt-vinegar', 'Walkers Salt & Vinegar Crisps', 150, 160, '2g', '16g', '10g', ['None']],
    ['snack-prawn-cocktail', 'Walkers Prawn Cocktail Crisps', 150, 160, '2g', '17g', '10g', ['None']],
    ['snack-cheese-onion', 'Walkers Cheese & Onion Crisps', 150, 165, '2.5g', '16g', '10.5g', ['Dairy']],
    ['snack-dairy-milk', 'Cadbury Dairy Milk Chocolate', 140, 240, '3.5g', '26g', '13.5g', ['Dairy']],
    ['snack-snickers', 'Snickers Chocolate Bar', 140, 250, '4.5g', '27g', '13g', ['Dairy', 'Peanuts', 'Egg', 'Soya']],
    ['snack-mars', 'Mars Chocolate Bar', 140, 230, '2.5g', '35g', '9g', ['Dairy', 'Egg', 'Soya']],
    ['snack-bounty', 'Bounty Coconut Chocolate', 140, 235, '1.8g', '28g', '12g', ['Dairy', 'Soya']],
  ] as const).map<Product>(([id, name, price, cal, prot, carb, fat, allerg]) => ({
    id, name, category: 'SNACKS', description: 'Crisp or sweet snack bar', price,
    image: '',
    model: null, video: null, extras: [], sauces: false,
    vegetarian: true, glutenFree: false, halalFriendly: true, mealEligible: false,
    baseToppings: [], available: true,
    calories: cal, protein: prot, carbs: carb, fat, allergens: [...allerg],
    tags: ['Crunchy Snack 🥨', 'Meal Deal Side'],
    pairedWith: ['cold-coca-cola', 'spud-great-british'],
  })),
]

export const SPUDS = PRODUCTS.filter((p) => p.category === 'SPUDS')
export const WRAPS = PRODUCTS.filter((p) => p.category === 'WRAPS')
export const RICE_BOXES = PRODUCTS.filter((p) => p.category === 'RICE_BOXES')
export const BAGUETTES = PRODUCTS.filter((p) => p.category === 'BAGUETTES')
export const PANINIS = PRODUCTS.filter((p) => p.category === 'PANINIS')
export const SALADS = PRODUCTS.filter((p) => p.category === 'SALADS')
export const DRINKS = PRODUCTS.filter((p) => p.category === 'COLD_DRINKS' || p.category === 'HOT_DRINKS')
export const SNACKS = PRODUCTS.filter((p) => p.category === 'SNACKS')

const DYNAMIC_PRODUCTS_KEY = 'just_spuds_dynamic_products_v1'
const DYNAMIC_EXTRAS_KEY = 'just_spuds_dynamic_extras_v1'
const DYNAMIC_SAUCES_KEY = 'just_spuds_dynamic_sauces_v1'

export function getAllProducts(): Product[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(DYNAMIC_PRODUCTS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Product[]
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
  }
  return PRODUCTS
}

function getStoredDynamicExtras(): Option[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(DYNAMIC_EXTRAS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Option[]
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
  }
  return SPUD_EXTRAS
}

function getStoredDynamicSauces(): Option[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(DYNAMIC_SAUCES_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Option[]
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
  }
  return SAUCES
}

export const extrasFor = (p: Product): Option[] => {
  if (p.category === 'SPUDS') return getStoredDynamicExtras()
  if (p.category === 'WRAPS') return WRAP_EXTRAS
  if (p.category === 'RICE_BOXES') return RICE_BOX_EXTRAS
  if (p.category === 'BAGUETTES') return BAGUETTE_EXTRAS
  if (p.category === 'PANINIS') return PANINI_EXTRAS
  if (p.category === 'SALADS') return SALAD_EXTRAS
  return []
}

export const optionLabel = (id: string): string => {
  const dynamicExtras = getStoredDynamicExtras()
  const dynamicSauces = getStoredDynamicSauces()
  const all = [...dynamicExtras, ...WRAP_EXTRAS, ...RICE_BOX_EXTRAS, ...BAGUETTE_EXTRAS, ...PANINI_EXTRAS, ...SALAD_EXTRAS, ...dynamicSauces, ...FRESH_SALAD_OPTIONS]
  return all.find((o) => o.id === id)?.label ?? id
}

export const optionPrice = (id: string, category: CategoryId): number => {
  if (category === 'SPUDS') return getStoredDynamicExtras().find((o) => o.id === id)?.price ?? 0
  if (category === 'WRAPS') return WRAP_EXTRAS.find((o) => o.id === id)?.price ?? 0
  if (category === 'RICE_BOXES') return RICE_BOX_EXTRAS.find((o) => o.id === id)?.price ?? 0
  if (category === 'BAGUETTES') return BAGUETTE_EXTRAS.find((o) => o.id === id)?.price ?? 0
  if (category === 'PANINIS') return PANINI_EXTRAS.find((o) => o.id === id)?.price ?? 0
  if (category === 'SALADS') return SALAD_EXTRAS.find((o) => o.id === id)?.price ?? 0
  return 0
}

export const productsByCategory = (id: CategoryId): Product[] => {
  return getAllProducts().filter((p) => p.category === id)
}

export const getProduct = (id: string): Product | undefined => {
  return getAllProducts().find((p) => p.id === id)
}
