import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const brainDir = `C:\\Users\\VANSH\\.gemini\\antigravity-ide\\brain\\d18f5dcf-2fef-467a-a7f1-efd43ae2012f`

// Map of key -> generated image if available
const generatedMap = {
  'food/spuds/great-british-classic.png': 'great_british_classic',
  'food/spuds/spud-father.png': 'spud_father',
  'food/baguette/baguette-feature.png': 'baguette_feature',
  'food/panini/panini-feature.png': 'panini_feature',
  'food/salad/salad-feature.png': 'salad_feature',
  'drinks/coffee/coffee-promo.png': 'coffee_promo',
}

const findBrainImage = (prefix) => {
  if (!fs.existsSync(brainDir)) return null
  const files = fs.readdirSync(brainDir)
  const match = files.find(f => f.startsWith(prefix) && f.endsWith('.png'))
  return match ? path.join(brainDir, match) : null
}

const keys = [
  'food/spuds/just-a-spud.png',
  'food/spuds/great-british-classic.png',
  'food/spuds/just-cheese.png',
  'food/spuds/spud-father.png',
  'food/spuds/tuna-mayo.png',
  'food/spuds/chilli-con-carne.png',
  'food/spuds/just-chicken.png',
  'food/baguette/plain-chicken.png',
  'food/baguette/chicken-mayo.png',
  'food/baguette/chicken-tikka.png',
  'food/baguette/coronation.png',
  'food/baguette/bbq-chicken.png',
  'food/baguette/tuna-mayo.png',
  'food/baguette/tuna-crunch.png',
  'food/baguette/baguette-feature.png',
  'food/panini/pulled-chicken.png',
  'food/panini/tuna-cheese.png',
  'food/panini/cheese-tomato.png',
  'food/panini/panini-feature.png',
  'food/salad/just-salad.png',
  'food/salad/tuna-salad.png',
  'food/salad/chicken-salad.png',
  'food/salad/salad-feature.png',
  'food/rice-bowl/rice-bowl-feature.png',
  'food/pita/pita-feature.png',
  'drinks/coffee/coffee-promo.png',
  'drinks/thick-shake/shake-promo.png',
  'heritage/aylesbury-market.png',
  'heritage/victorian-potato-seller.png',
  'heritage/just-spuds-today.png',
]

// Fallback high quality PNG generator for any missing PNGs using node
// We can use primary generated images or copy closest generated image
const defaultHero = findBrainImage('great_british_classic')
const defaultBaguette = findBrainImage('baguette_feature')
const defaultPanini = findBrainImage('panini_feature')
const defaultSalad = findBrainImage('salad_feature')
const defaultCoffee = findBrainImage('coffee_promo')

for (const key of keys) {
  const targetPath = path.join(root, 'public', 'assets', key)
  const dir = path.dirname(targetPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // Check if we have a generated image for this key
  const genPrefix = generatedMap[key]
  const brainPath = genPrefix ? findBrainImage(genPrefix) : null

  if (brainPath && fs.existsSync(brainPath)) {
    fs.copyFileSync(brainPath, targetPath)
    console.log(`Copied generated: ${key}`)
  } else if (!fs.existsSync(targetPath)) {
    // Pick the best match source
    let source = defaultHero
    if (key.includes('baguette')) source = defaultBaguette || defaultHero
    else if (key.includes('panini')) source = defaultPanini || defaultHero
    else if (key.includes('salad')) source = defaultSalad || defaultHero
    else if (key.includes('coffee') || key.includes('drink')) source = defaultCoffee || defaultHero

    if (source && fs.existsSync(source)) {
      fs.copyFileSync(source, targetPath)
      console.log(`Populated asset: ${key}`)
    }
  }
}
