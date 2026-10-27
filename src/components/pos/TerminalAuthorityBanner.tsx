import { useState, useEffect } from 'react'
import {
  getMasterTerminalInfo,
  isMasterTerminal,
  claimMasterTerminal,
  releaseMasterTerminal,
  subscribeMasterTerminal,
  getLocalDeviceName,
  type MasterTerminalInfo,
} from '../../services/terminalLockStore'

interface TerminalAuthorityBannerProps {
  actor: string
  requireManagerAuth: (title: string, desc: string, onSuccess: (mgr: string) => void) => void
  onClaimed?: () => void
  onOpenSoftwareModal?: () => void
}

export default function TerminalAuthorityBanner({
  actor,
  requireManagerAuth,
  onClaimed,
  onOpenSoftwareModal,
}: TerminalAuthorityBannerProps) {
  const [masterInfo, setMasterInfo] = useState<MasterTerminalInfo | null>(() => getMasterTerminalInfo())
  const [isMaster, setIsMaster] = useState(() => isMasterTerminal())

  useEffect(() => {
    return subscribeMasterTerminal((info) => {
      setMasterInfo(info)
      setIsMaster(isMasterTerminal())
    })
  }, [])

  if (isMaster && masterInfo) {
    // Current machine is the authorized master till
    return null
  }

  if (!masterInfo) {
    // No device has claimed master till role yet
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
        <div className="flex items-center gap-2">
          <span>🛡️</span>
          <span className="font-bold">
            No Master Till registered yet. Register this machine ({getLocalDeviceName()}) as the official counter till to prevent conflicts.
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onOpenSoftwareModal && (
            <button
              type="button"
              onClick={onOpenSoftwareModal}
              className="rounded-lg border border-amber-400/40 bg-amber-400/20 px-2.5 py-1 font-body text-[11px] font-bold text-amber-200 hover:bg-amber-400 hover:text-slate-950 transition"
            >
              Station Setup &amp; Software
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              requireManagerAuth(
                'Enroll Master Store Till',
                `Enroll and bind this workstation (${getLocalDeviceName()}) as the official Master Counter Till`,
                (mgr) => {
                  claimMasterTerminal(mgr || actor)
                  onClaimed?.()
                },
              )
            }}
            className="rounded-lg bg-amber-400 px-3 py-1 font-body text-[11px] font-black uppercase tracking-wider text-ink hover:bg-amber-300 shadow transition"
          >
            Claim As Master Till ✓
          </button>
        </div>
      </div>
    )
  }

  // Current machine is a SECONDARY device
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-500/40 bg-rose-950/80 px-3 py-2 text-xs text-rose-200">
      <div className="flex items-center gap-2">
        <span className="text-base">🔒</span>
        <div>
          <span className="font-black uppercase tracking-wider text-rose-300 mr-2">Secondary Device</span>
          <span>
            Register authority is currently held by <strong>{masterInfo.name}</strong>. Till register sales are locked here to prevent cash drawer and float conflicts.
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onOpenSoftwareModal && (
          <button
            type="button"
            onClick={onOpenSoftwareModal}
            className="rounded-lg border border-rose-400/40 bg-rose-900/40 px-2.5 py-1 font-body text-[11px] font-bold text-rose-200 hover:bg-rose-800 transition"
          >
            Station Software
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            requireManagerAuth(
              'Transfer Master Till',
              `Transfer master register authority from "${masterInfo.name}" to this device (${getLocalDeviceName()})`,
              (mgr) => {
                releaseMasterTerminal(mgr)
                claimMasterTerminal(mgr)
                onClaimed?.()
              }
            )
          }}
          className="rounded-lg border border-rose-400/50 bg-rose-600 px-3 py-1 font-body text-[11px] font-black uppercase tracking-wider text-white hover:bg-rose-500 shadow-glow transition shrink-0"
        >
          Transfer Master Authority 🔑
        </button>
      </div>
    </div>
  )
}
