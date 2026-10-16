import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { subscribeSyncStatus, syncNow, type SyncStatus } from '../../services/cloudSync'
import { gbp } from '../../utils/format'

/**
 * EPOS-style side menu (the ☰ in the corner): cash, reports, stock, back
 * office, cloud sync and settings — everything a cashier needs now and then
 * but not on every sale.
 */

export type SideMenuAction =
  | 'float'
  | 'petty'
  | 'tip_out'
  | 'no_sale'
  | 'x_read'
  | 'close_till'
  | 'history'
  | 'stock'
  | 'orders'
  | 'reprint'
  | 'timeclock'
  | 'cfd'
  | 'settings'
  | 'shortcuts'
  | 'lock'

interface Item {
  action: SideMenuAction
  icon: string
  label: string
  hint?: string
  danger?: boolean
  disabled?: boolean
}

function ago(iso?: string) {
  if (!iso) return 'never'
  const d = new Date(iso)
  return d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function TillSideMenu({
  tillName,
  userName,
  shiftNumber,
  floatPence,
  canReprint,
  isManager,
  onAction,
  onClose,
}: {
  tillName: string
  userName: string
  shiftNumber: number
  floatPence: number
  canReprint: boolean
  isManager: boolean
  onAction: (action: SideMenuAction) => void
  onClose: () => void
}) {
  const [sync, setSync] = useState<SyncStatus | null>(null)
  useEffect(() => subscribeSyncStatus(setSync), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Cash',
      items: [
        { action: 'float', icon: '💷', label: 'Adjust float', hint: 'Change in, bank drop out' },
        { action: 'petty', icon: '🧾', label: 'Petty cash', hint: 'Supplies paid from the drawer' },
        { action: 'tip_out', icon: '🙌', label: 'Tip out', hint: 'Tips paid to the team' },
        { action: 'no_sale', icon: '🔓', label: 'No sale', hint: 'Open the drawer — manager PIN' },
      ],
    },
    {
      title: 'Reports',
      items: [
        { action: 'x_read', icon: '📊', label: 'X read', hint: 'Today so far — till stays open' },
        { action: 'close_till', icon: '🔒', label: 'Close till', hint: 'Cash up and print the end-of-day report', danger: true },
        { action: 'history', icon: '🗂️', label: 'Past end-of-day reports', hint: 'Reprint an earlier day' },
      ],
    },
    {
      title: 'Till',
      items: [
        { action: 'orders', icon: '📋', label: 'Orders & refunds' },
        { action: 'reprint', icon: '🖨️', label: 'Reprint last receipt', disabled: !canReprint },
        { action: 'stock', icon: '📦', label: 'Stock & sold out' },
        { action: 'timeclock', icon: '⏱️', label: 'Clock in / out' },
        { action: 'cfd', icon: '📺', label: 'Customer display' },
        { action: 'shortcuts', icon: '⌨️', label: 'Keyboard shortcuts' },
      ],
    },
  ]

  const syncLine =
    !sync || sync.state === 'off'
      ? 'This device only'
      : sync.state === 'offline'
      ? `Offline${sync.pending ? ` — ${sync.pending} waiting` : ''}`
      : sync.pending
      ? `Syncing ${sync.pending}…`
      : 'Up to date'

  return (
    <div className="fixed inset-0 z-[57] flex" role="dialog" aria-modal="true" aria-label="Till menu">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <nav className="relative flex h-full w-[min(20rem,88vw)] flex-col overflow-y-auto overscroll-contain border-r border-white/10 bg-slate-900 text-white shadow-2xl font-body">
        <div className="flex items-start justify-between gap-2 border-b border-white/10 p-4">
          <div className="min-w-0">
            <p className="font-mono text-xs font-black tracking-wider text-amber-300">{tillName.toUpperCase()}</p>
            <p className="truncate text-sm font-bold">{userName}</p>
            <p className="text-[11px] text-white/50">
              Shift #{shiftNumber} • float {gbp(floatPence)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/70 hover:text-white" aria-label="Close menu">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-3 p-2">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="px-2.5 pb-1 pt-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/35">{g.title}</p>
              {g.items.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => onAction(item.action)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition disabled:opacity-35 ${item.danger ? 'text-rose-200 hover:bg-rose-950/60' : 'hover:bg-white/10'}`}
                >
                  <span className="text-lg" aria-hidden>{item.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{item.label}</span>
                    {item.hint && <span className="block text-[11px] text-white/45">{item.hint}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}

          <div>
            <p className="px-2.5 pb-1 pt-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Back office</p>
            <Link to="/admin" className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-white/10">
              <span className="text-lg" aria-hidden>🏢</span>
              <span>
                <span className="block text-sm font-bold">Back office</span>
                <span className="block text-[11px] text-white/45">Menu, prices, staff, reports{isManager ? '' : ' — manager PIN'}</span>
              </span>
            </Link>
            <Link to="/staff" className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-white/10">
              <span className="text-lg" aria-hidden>👨‍🍳</span>
              <span className="block text-sm font-bold">Kitchen screen</span>
            </Link>
            <button type="button" onClick={() => onAction('settings')} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-white/10">
              <span className="text-lg" aria-hidden>⚙️</span>
              <span>
                <span className="block text-sm font-bold">Settings</span>
                <span className="block text-[11px] text-white/45">Till name, printer, drawer, sounds — manager PIN</span>
              </span>
            </button>
          </div>
        </div>

        <div className="space-y-2 border-t border-white/10 p-3">
          <button type="button" onClick={() => void syncNow()} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-white/10" title="Sync now">
            <span className="text-lg" aria-hidden>☁️</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">Cloud sync — {syncLine}</span>
              <span className="block text-[11px] text-white/45">Last sync {ago(sync?.lastSyncAt)}</span>
            </span>
          </button>
          <button type="button" onClick={() => onAction('lock')} className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 py-2.5 text-xs font-black uppercase tracking-wider text-rose-200 hover:bg-rose-900/50">
            🔒 Lock till
          </button>
        </div>
      </nav>
    </div>
  )
}
