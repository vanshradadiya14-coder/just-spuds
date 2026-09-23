import { useEffect, useState } from 'react'
import { subscribeSyncStatus, syncNow, type SyncStatus } from '../services/cloudSync'
import { cx } from '../utils/format'

function ago(iso?: string) {
  if (!iso) return ''
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  return mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`
}

/**
 * Tells staff whether this screen is in step with the others. Tap to sync now.
 * Offline is safe — sales keep working and upload when the connection is back.
 */
export default function SyncStatusPill({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [, force] = useState(0)

  useEffect(() => {
    const unsub = subscribeSyncStatus(setStatus)
    const t = setInterval(() => force((n) => n + 1), 30_000)
    return () => {
      unsub()
      clearInterval(t)
    }
  }, [])

  if (!status) return null
  const view =
    status.state === 'synced' && status.pending === 0
      ? { dot: 'bg-emerald-400', text: 'Synced', tone: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300', title: `All screens up to date (${ago(status.lastSyncAt)})` }
      : status.state === 'offline'
      ? {
          dot: 'bg-amber-400 animate-pulse',
          text: status.pending ? `Offline · ${status.pending} waiting` : 'Offline',
          tone: 'border-amber-400/40 bg-amber-500/15 text-amber-300',
          title: status.lastError || 'Saved on this device — uploads automatically when the connection returns.',
        }
      : status.state === 'off'
      ? { dot: 'bg-white/40', text: 'This device only', tone: 'border-white/15 bg-white/5 text-white/60', title: 'Cloud sync is not configured for this build.' }
      : { dot: 'bg-sky-400 animate-pulse', text: status.pending ? `Syncing ${status.pending}` : 'Connecting', tone: 'border-sky-400/30 bg-sky-500/10 text-sky-300', title: 'Connecting to the other screens…' }

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      title={`${view.title} — tap to sync now`}
      className={cx('inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1 font-body text-[11px] font-bold whitespace-nowrap', view.tone)}
    >
      <span className={cx('h-2 w-2 rounded-full', view.dot)} />
      {!compact && <span>{view.text}</span>}
    </button>
  )
}
