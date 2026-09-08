import { useState, useEffect, type ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { type Product, type CategoryId, SPUD_EXTRAS } from '../data/menu'
import { getCategories, getStoreSettings, saveStoreSettings } from '../services/menuStore'
import { gbp } from '../utils/format'
import SmartImage from './SmartImage'

interface AdminProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (product: Product) => void
  initialProduct?: Product | null
}



const IMAGE_PRESETS = [
  { label: 'Classic Cheddar & Beans Spud', url: '/assets/food/spuds/great-british-classic.jpg' },
  { label: 'Peri-Peri Chicken Tikka Wrap', url: '/assets/food/wraps/peri-peri-wrap.jpg' },
  { label: 'Lamb Steak Tikka Rice Box', url: '/assets/food/rice_boxes/lamb-steak-box.jpg' },
  { label: 'Steak & Onion Panini Melt', url: '/assets/food/paninis/steak-onion-panini.jpg' },
  { label: 'Chilli Con Carne Spud', url: '/assets/food/spuds/chilli-con-carne.png' },
  { label: 'Tuna Mayo & Sweetcorn Spud', url: '/assets/food/spuds/tuna-mayo-sweetcorn.png' },
  { label: 'Cheesy Broccoli & Bacon Spud', url: '/assets/food/spuds/cheesy-broccoli.png' },
  { label: 'Crisp Chicken Baguette', url: '/assets/food/baguette/plain-chicken.png' },
  { label: 'Greek Feta Salad', url: '/assets/food/salad/just-salad.png' },
  { label: 'Coke Zero Can', url: '/assets/food/drinks/coke-zero.png' },
]

const ALLERGEN_OPTIONS = ['Gluten', 'Milk', 'Mustard', 'Eggs', 'Fish', 'Celery', 'Soya', 'Nuts', 'Sesame']

export default function AdminProductModal({
  isOpen,
  onClose,
  onSave,
  initialProduct,
}: AdminProductModalProps) {
  const activeCategories = getCategories()
  
  const [name, setName] = useState('')
  const [category, setCategory] = useState<CategoryId>('SPUDS')
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [priceGbp, setPriceGbp] = useState('6.45')
  const [size, setSize] = useState('Regular')
  const [description, setDescription] = useState('')
  const [baseFillingsInput, setBaseFillingsInput] = useState('')
  const [image, setImage] = useState('/assets/food/spuds/great-british-classic.png')
  const [customImage, setCustomImage] = useState('')
  const [selectedExtras, setSelectedExtras] = useState<string[]>([])
  const [vegetarian, setVegetarian] = useState(false)
  const [glutenFree, setGlutenFree] = useState(false)
  const [halalFriendly, setHalalFriendly] = useState(true)
  const [mealEligible, setMealEligible] = useState(true)
  const [calories, setCalories] = useState<number>(480)
  const [protein, setProtein] = useState('20g')
  const [carbs, setCarbs] = useState('60g')
  const [fat, setFat] = useState('14g')
  const [allergens, setAllergens] = useState<string[]>([])

  useEffect(() => {
    if (initialProduct) {
      setName(initialProduct.name)
      setCategory(initialProduct.category)
      setPriceGbp((initialProduct.price / 100).toFixed(2))
      setSize(initialProduct.size || 'Regular')
      setDescription(initialProduct.description)
      setBaseFillingsInput(initialProduct.baseToppings ? initialProduct.baseToppings.join(', ') : '')
      setImage(initialProduct.image)
      setCustomImage(initialProduct.image.startsWith('data:') || initialProduct.image.startsWith('http') ? initialProduct.image : '')
      setSelectedExtras(initialProduct.extras || SPUD_EXTRAS.map((e) => e.id))
      setVegetarian(initialProduct.vegetarian)
      setGlutenFree(initialProduct.glutenFree ?? false)
      setHalalFriendly(initialProduct.halalFriendly ?? true)
      setMealEligible(initialProduct.mealEligible)
      setCalories(initialProduct.calories ?? 480)
      setProtein(initialProduct.protein ?? '20g')
      setCarbs(initialProduct.carbs ?? '60g')
      setFat(initialProduct.fat ?? '14g')
      setAllergens(initialProduct.allergens ?? [])
    } else {
      // New item defaults
      setName('')
      setCategory('SPUDS')
      setPriceGbp('6.45')
      setSize('Regular')
      setDescription('')
      setBaseFillingsInput('Mature British Cheddar, Heinz Baked Beanz, Farmhouse Butter')
      setImage('/assets/food/spuds/great-british-classic.png')
      setCustomImage('')
      setSelectedExtras(SPUD_EXTRAS.map((e) => e.id))
      setVegetarian(false)
      setGlutenFree(false)
      setHalalFriendly(true)
      setMealEligible(true)
      setCalories(480)
      setProtein('20g')
      setCarbs('60g')
      setFat('14g')
      setAllergens(['Milk'])
    }
  }, [initialProduct, isOpen])

  if (!isOpen) return null

  // Handle local photo file upload & conversion to Base64 Data URL
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      if (event.target?.result) {
        const dataUrl = event.target.result as string
        setCustomImage(dataUrl)
        setImage(dataUrl)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleAllergenToggle = (allg: string) => {
    setAllergens((prev) =>
      prev.includes(allg) ? prev.filter((a) => a !== allg) : [...prev, allg]
    )
  }

  const handleExtraToggle = (extraId: string) => {
    setSelectedExtras((prev) =>
      prev.includes(extraId) ? prev.filter((id) => id !== extraId) : [...prev, extraId]
    )
  }

  const handleAddNewCategory = () => {
    if (!newCategoryName.trim()) {
      setIsAddingCategory(false)
      return
    }
    const newId = newCategoryName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
    const settings = getStoreSettings()
    const custom = settings.customCategories || []
    
    // Check if exists
    if (!activeCategories.find(c => c.id === newId)) {
      settings.customCategories = [...custom, { id: newId, label: newCategoryName.trim(), blurb: '' }]
      saveStoreSettings(settings)
    }
    
    setCategory(newId)
    setNewCategoryName('')
    setIsAddingCategory(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const pricePence = Math.round(parseFloat(priceGbp || '0') * 100)
    const finalImage = customImage.trim() || image

    const generatedId =
      initialProduct?.id ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') ||
      `prod-${Date.now()}`

    const parsedFillings = baseFillingsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const productToSave: Product = {
      id: generatedId,
      name: name.trim(),
      category,
      price: pricePence,
      size,
      description: description.trim(),
      image: finalImage,
      model: null,
      video: null,
      extras: selectedExtras,
      sauces: initialProduct?.sauces ?? true,
      vegetarian,
      glutenFree,
      halalFriendly,
      mealEligible,
      baseToppings: parsedFillings,
      available: initialProduct?.available ?? true,
      calories,
      protein,
      carbs,
      fat,
      allergens,
    }

    onSave(productToSave)
    onClose()
  }

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-5xl rounded-3xl bg-slate-900 border border-amber-400/40 p-6 text-slate-100 shadow-2xl my-auto max-h-[94vh] flex flex-col font-body"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4 shrink-0">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-400 text-xl text-ink shadow-glow font-bold">
                {initialProduct ? '✏️' : '➕'}
              </span>
              <div>
                <h2 className="display text-xl font-bold text-white">
                  {initialProduct ? `Edit Food Item: ${initialProduct.name}` : 'Add Completely New Food Item'}
                </h2>
                <p className="font-body text-xs text-white/60">
                  Configure food name, pricing, fillings/varieties, custom photo upload, and dietary traits
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition"
            >
              ✕
            </button>
          </div>

          {/* Modal Form & Live Preview Grid */}
          <form onSubmit={handleSubmit} className="overflow-y-auto space-y-6 pr-1">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* Left Column: Form Inputs */}
              <div className="md:col-span-7 space-y-4">
                
                {/* 1. Name & Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                      Dish / Food Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Cheesy Truffle Jacket Spud"
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 font-body text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300">
                        Menu Category *
                      </label>
                      {!isAddingCategory && (
                        <button
                          type="button"
                          onClick={() => setIsAddingCategory(true)}
                          className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold"
                        >
                          + Add New
                        </button>
                      )}
                    </div>
                    {isAddingCategory ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="e.g. Desserts"
                          className="w-full rounded-xl border border-emerald-500/40 bg-white/10 px-3.5 py-2 font-body text-xs text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleAddNewCategory()
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddNewCategory}
                          className="rounded-xl bg-emerald-500 px-3 py-2 font-body text-xs font-black text-slate-900 hover:bg-emerald-400"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as CategoryId)}
                        className="w-full rounded-xl border border-white/20 bg-slate-800 px-3.5 py-2 font-body text-xs text-white focus:border-amber-400 focus:outline-none"
                      >
                        {activeCategories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* 2. Price, Variety/Portion Size, Description */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                      Price (£ GBP) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 font-bold text-amber-400 text-xs">£</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        required
                        value={priceGbp}
                        onChange={(e) => setPriceGbp(e.target.value)}
                        placeholder="6.45"
                        className="w-full rounded-xl border border-white/20 bg-white/10 pl-7 pr-3 py-2 font-mono text-xs text-white focus:border-amber-400 focus:outline-none font-bold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                      Variety / Portion Size
                    </label>
                    <input
                      type="text"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      placeholder="e.g. Jumbo Loaded, Regular, Double"
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 font-body text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                      Menu Description
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Crispy King Edward skin, steaming fluffy..."
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 font-body text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 3. Included Fillings & Base Toppings (Request 1: Fillings & Variety) */}
                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300">
                      🥔 Included Fillings &amp; Default Toppings (Comma Separated)
                    </label>
                    <span className="text-[10px] text-amber-400 font-mono">Drives 3D Potato Build</span>
                  </div>
                  <input
                    type="text"
                    value={baseFillingsInput}
                    onChange={(e) => setBaseFillingsInput(e.target.value)}
                    placeholder="e.g. Mature British Cheddar, Heinz Baked Beanz, Garlic Mayo, Crispy Shallots"
                    className="w-full rounded-xl border border-amber-400/40 bg-black/40 px-3.5 py-2 font-body text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                  />
                  <p className="text-[10px] text-amber-200/70">
                    List all toppings included by default on this dish. Customers can view these fillings and add extra toppings during checkout.
                  </p>
                </div>

                {/* 4. CUSTOM PHOTO SELECTION (Request 2: Custom Photo File Upload & URL) */}
                <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300">
                      📸 Food Item Photo (Select Preset, Upload Custom File, or Paste URL)
                    </label>
                    {customImage && (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/40">
                        ✓ Custom Photo Selected
                      </span>
                    )}
                  </div>

                  {/* Photo File Upload Button */}
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer rounded-xl bg-amber-400 px-4 py-2 text-xs font-black uppercase text-ink shadow hover:bg-amber-300 transition flex items-center gap-1.5 shrink-0">
                      <span>📁</span>
                      <span>Upload Custom Photo File</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                    <span className="text-xs text-white/50">or select preset gallery below:</span>
                  </div>

                  {/* Preset Gallery Grid */}
                  <div className="grid grid-cols-5 gap-2">
                    {IMAGE_PRESETS.map((preset) => (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() => {
                          setImage(preset.url)
                          setCustomImage('')
                        }}
                        className={`h-12 rounded-xl overflow-hidden border-2 transition ${
                          image === preset.url && !customImage
                            ? 'border-amber-400 shadow-glow scale-105'
                            : 'border-white/10 opacity-60 hover:opacity-100'
                        }`}
                        title={preset.label}
                      >
                        <SmartImage src={preset.url} alt="" className="h-full w-full" cover />
                      </button>
                    ))}
                  </div>

                  {/* Custom Photo URL Input */}
                  <input
                    type="text"
                    value={customImage}
                    onChange={(e) => {
                      setCustomImage(e.target.value)
                      if (e.target.value.trim()) setImage(e.target.value.trim())
                    }}
                    placeholder="Or paste custom photo URL (/assets/... or https://...)"
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3.5 py-1.5 font-body text-xs text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                {/* 5. Allowed Extra Toppings Selection */}
                <div className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    🧀 Available Extra Topping Customization Options
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    {SPUD_EXTRAS.map((extra) => (
                      <label key={extra.id} className="flex items-center gap-2 cursor-pointer text-[11px]">
                        <input
                          type="checkbox"
                          checked={selectedExtras.includes(extra.id)}
                          onChange={() => handleExtraToggle(extra.id)}
                          className="rounded accent-amber-400"
                        />
                        <span className="text-white/80">{extra.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 6. Dietary Badges & Nutrition */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-400">
                      Dietary &amp; Meal Deal Badges
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={vegetarian}
                          onChange={(e) => setVegetarian(e.target.checked)}
                          className="rounded accent-amber-400"
                        />
                        <span>🌱 Vegetarian</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={glutenFree}
                          onChange={(e) => setGlutenFree(e.target.checked)}
                          className="rounded accent-amber-400"
                        />
                        <span>🌾 Gluten-Free</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={halalFriendly}
                          onChange={(e) => setHalalFriendly(e.target.checked)}
                          className="rounded accent-amber-400"
                        />
                        <span>🌙 Halal</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mealEligible}
                          onChange={(e) => setMealEligible(e.target.checked)}
                          className="rounded accent-amber-400"
                        />
                        <span>🥤 Meal Deal</span>
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-2">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-white/50">
                      Nutritional Macros
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <span className="text-[10px] text-white/50 block">Calories</span>
                        <input
                          type="number"
                          value={calories}
                          onChange={(e) => setCalories(parseInt(e.target.value, 10) || 0)}
                          className="w-full rounded-lg border border-white/20 bg-white/10 px-2 py-1 font-mono text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-white/50 block">Protein</span>
                        <input
                          type="text"
                          value={protein}
                          onChange={(e) => setProtein(e.target.value)}
                          className="w-full rounded-lg border border-white/20 bg-white/10 px-2 py-1 font-mono text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-white/50 block">Carbs</span>
                        <input
                          type="text"
                          value={carbs}
                          onChange={(e) => setCarbs(e.target.value)}
                          className="w-full rounded-lg border border-white/20 bg-white/10 px-2 py-1 font-mono text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-white/50 block">Fat</span>
                        <input
                          type="text"
                          value={fat}
                          onChange={(e) => setFat(e.target.value)}
                          className="w-full rounded-lg border border-white/20 bg-white/10 px-2 py-1 font-mono text-xs text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Allergens */}
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-white/60 mb-1.5">
                    Declared Allergens
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {ALLERGEN_OPTIONS.map((allg) => (
                      <button
                        key={allg}
                        type="button"
                        onClick={() => handleAllergenToggle(allg)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                          allergens.includes(allg)
                            ? 'bg-rose-500/20 border border-rose-500 text-rose-300 font-black'
                            : 'bg-white/5 border border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {allg}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Live Storefront Card Preview */}
              <div className="md:col-span-5 flex flex-col justify-between space-y-4">
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-2">
                    Customer Menu Card Live Preview
                  </span>
                  <div className="rounded-3xl border border-white/20 bg-gradient-to-b from-slate-800 to-slate-900 p-5 shadow-2xl space-y-3">
                    <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden bg-black/30 relative">
                      <SmartImage
                        src={customImage.trim() || image}
                        alt={name || 'Product'}
                        className="h-full w-full"
                        cover
                      />
                      <span className="absolute top-2.5 right-2.5 rounded-full bg-amber-400 px-3 py-1 font-mono text-xs font-black text-ink shadow-md">
                        {gbp(Math.round(parseFloat(priceGbp || '0') * 100))}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                          {category} &bull; {size}
                        </span>
                        <div className="flex items-center gap-1">
                          {vegetarian && <span className="text-[10px]">🌱</span>}
                          {glutenFree && <span className="text-[10px]">🌾</span>}
                          {halalFriendly && <span className="text-[10px]">🌙</span>}
                        </div>
                      </div>

                      <h4 className="display text-base text-white font-bold">{name || 'Item Name'}</h4>
                      <p className="font-body text-xs text-white/60 line-clamp-2 mt-0.5">
                        {description || 'Crisp King Edward skin roasted hot & fresh.'}
                      </p>

                      {baseFillingsInput.trim() && (
                        <div className="mt-2.5 rounded-xl bg-amber-400/10 border border-amber-400/30 p-2 text-[11px] text-amber-300">
                          <strong>Fillings included:</strong> {baseFillingsInput}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px] text-white/50 font-mono">
                      <span>{calories} kcal</span>
                      <span>P: {protein} &bull; C: {carbs} &bull; F: {fat}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-amber-400 py-3.5 font-body text-xs font-black uppercase tracking-wider text-ink shadow-glow hover:bg-amber-300 transition"
                  >
                    {initialProduct ? '✓ Save Product Changes' : '✨ Publish New Food Item to Menu'} →
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full rounded-2xl border border-white/20 bg-white/5 py-2.5 font-body text-xs font-bold text-white/70 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>

            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
