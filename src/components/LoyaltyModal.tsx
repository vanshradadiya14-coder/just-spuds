import { useState, useEffect } from 'react'
import {
  getLoyaltyState,
  subscribeLoyalty,
  redeemReward,
  AVAILABLE_REWARDS,
  type LoyaltyState,
} from '../services/loyaltyStore'
import { useCart } from '../hooks/useCart'

interface LoyaltyModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function LoyaltyModal({ isOpen, onClose }: LoyaltyModalProps) {
  const [loyalty, setLoyalty] = useState<LoyaltyState>(() => getLoyaltyState())
  const [statusMsg, setStatusMsg] = useState<{ text: string; success: boolean } | null>(null)
  const { applyPromo, open: openCart } = useCart()

  useEffect(() => {
    return subscribeLoyalty(setLoyalty)
  }, [])

  if (!isOpen) return null

  const handleClaim = (rewardId: string) => {
    const res = redeemReward(rewardId)
    if (res.ok && res.promoCode) {
      applyPromo(res.promoCode)
      setStatusMsg({ text: res.message, success: true })
      setTimeout(() => {
        onClose()
        openCart()
      }, 1200)
    } else {
      setStatusMsg({ text: res.message, success: false })
      setTimeout(() => setStatusMsg(null), 3000)
    }
  }

  // Tier metadata
  const tierBadges = {
    BRONZE: { label: 'Bronze Spud Member', color: 'from-amber-700 to-amber-900', perk: 'Earn 10 pts per £1' },
    SILVER: { label: 'Silver Potato Connoisseur', color: 'from-slate-400 to-slate-600', perk: 'Free extra cheese on every order' },
    GOLDEN_VIP: { label: 'Golden King Edward VIP 👑', color: 'from-amber-400 to-yellow-500 text-ink', perk: 'VIP Priority Oven Slot & Birthday Spud' },
  }
  const currentTier = tierBadges[loyalty.tier]

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto p-4 bg-ink/80 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="The Spud Club Rewards"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white text-ink shadow-2xl border border-amber-500/30 my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-500/20 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-transparent px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-400 text-2xl shadow-glow">
              🥔
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="display text-xl font-bold text-ink">
                  The Spud Club
                </h3>
                <span className="rounded-full bg-amber-400 px-2 py-0.5 font-body text-[10px] font-black uppercase text-ink">
                  VIP Rewards
                </span>
              </div>
              <p className="font-body text-xs text-slate-600">
                Collect stamps, unlock points, and feast on free potatoes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-ink/5 hover:text-ink transition"
          >
            ✕
          </button>
        </div>

        {statusMsg && (
          <div
            className={`px-4 py-2.5 text-center font-body text-xs font-bold ${
              statusMsg.success ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Member Card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink via-slate-900 to-[#1F1914] p-6 text-white shadow-xl border border-amber-500/30">
            <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-amber-400/15 blur-2xl" />
            
            <div className="flex items-center justify-between">
              <div>
                <span className="font-body text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">
                  Digital Pass &bull; Just Spuds Aylesbury
                </span>
                <h4 className="display text-2xl font-bold text-white mt-0.5">
                  Spud Club Pass
                </h4>
              </div>
              <span className={`rounded-full px-3 py-1 font-body text-[10px] font-black uppercase tracking-wider bg-gradient-to-r ${currentTier.color}`}>
                {currentTier.label}
              </span>
            </div>

            <div className="mt-6 flex items-baseline justify-between border-t border-white/10 pt-4">
              <div>
                <p className="font-body text-[10px] uppercase tracking-wider text-white/60">Available Balance</p>
                <p className="display text-3xl font-black text-amber-300 tabular-nums">
                  {loyalty.points} <span className="font-body text-sm font-normal text-white/70">Points</span>
                </p>
              </div>
              <div className="text-right">
                <p className="font-body text-[10px] uppercase tracking-wider text-white/60">Free Spud Stamps</p>
                <p className="display text-2xl font-black text-amber-200 tabular-nums">
                  {loyalty.stamps} / 6
                </p>
              </div>
            </div>

            {/* Stamp Card Grid */}
            <div className="mt-4 rounded-2xl bg-black/40 p-3.5 border border-white/10">
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-200 mb-2">
                <span>Free Meal Stamp Card:</span>
                <span>{6 - loyalty.stamps} orders to next Free Spud!</span>
              </div>
              <div className="grid grid-cols-6 gap-2">
                {[0, 1, 2, 3, 4, 5].map((idx) => {
                  const isFilled = idx < loyalty.stamps
                  const isGift = idx === 5
                  return (
                    <div
                      key={idx}
                      className={`aspect-square rounded-xl flex items-center justify-center font-bold text-base transition-all ${
                        isFilled
                          ? 'bg-amber-400 text-ink shadow-glow scale-105'
                          : isGift
                          ? 'border-2 border-dashed border-amber-400/60 bg-amber-500/10 text-amber-300'
                          : 'border border-white/15 bg-white/5 text-white/30'
                      }`}
                    >
                      {isFilled ? '🥔' : isGift ? '🎁' : idx + 1}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Claimable Rewards */}
          <div className="space-y-3">
            <h4 className="font-body text-xs font-black uppercase tracking-wider text-ink flex items-center gap-1.5">
              <span>🎁</span>
              <span>Redeem Rewards from Points:</span>
            </h4>

            <div className="grid gap-3">
              {AVAILABLE_REWARDS.map((rew) => {
                const canAfford = loyalty.points >= rew.pointsCost
                return (
                  <div
                    key={rew.id}
                    className="flex items-center justify-between gap-3.5 rounded-2xl border border-ink/10 bg-paper/60 p-3.5 transition hover:border-amber-400 hover:bg-amber-50/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/20 text-xl text-amber-700">
                        {rew.icon}
                      </span>
                      <div>
                        <h5 className="font-body text-xs font-bold text-ink">{rew.title}</h5>
                        <p className="font-body text-[11px] text-slate-500 leading-snug">{rew.description}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleClaim(rew.id)}
                      disabled={!canAfford}
                      className={`shrink-0 rounded-full px-4 py-2 font-body text-[11px] font-bold uppercase tracking-wider transition ${
                        canAfford
                          ? 'bg-amber-400 text-ink shadow-sm hover:bg-amber-300 active:scale-95'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {rew.pointsCost} pts
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* How to earn */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-body text-slate-600 space-y-1.5">
            <p className="font-bold text-ink">💡 How Spud Club Works:</p>
            <ul className="list-disc pl-4 space-y-1 text-[11px]">
              <li>Earn 10 points for every £1 spent online or at our Market Square till.</li>
              <li>Every order placed stamps 1 slot on your card. 6 stamps = 1 completely Free Potato!</li>
              <li>Points never expire as long as your account remains active.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-ink/10 bg-slate-50 px-6 py-3.5">
          <p className="font-body text-[11px] text-slate-500">
            Terms: 1 voucher applicable per checkout. Non-transferable.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-ink px-6 py-2 font-body text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
