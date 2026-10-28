import { useState, useEffect } from 'react'
import {
  getLocalDeviceId,
  getLocalDeviceName,
  setLocalDeviceName,
  getMasterTerminalInfo,
  isMasterTerminal,
  enrollAndClaimMasterTerminal,
  releaseMasterTerminal,
  subscribeMasterTerminal,
  downloadDesktopLauncher,
  getLocalEnrollmentToken,
  type MasterTerminalInfo,
} from '../../services/terminalLockStore'
import {
  canInstallApp,
  isRunningStandalone,
  subscribeInstallPrompt,
  triggerInstallPrompt,
} from '../../services/installPromptStore'
import { isManagerOrAdmin, getCurrentUser, verifyManagerPinAsync } from '../../services/authStore'
import { playPOSTouchTone } from '../../services/printerBridge'

interface TerminalSoftwareEnrollmentModalProps {
  isOpen: boolean
  onClose: () => void
  onFlash?: (msg: string) => void
}

export default function TerminalSoftwareEnrollmentModal({
  isOpen,
  onClose,
  onFlash,
}: TerminalSoftwareEnrollmentModalProps) {
  const [masterInfo, setMasterInfo] = useState<MasterTerminalInfo | null>(() => getMasterTerminalInfo())
  const [isMaster, setIsMaster] = useState(() => isMasterTerminal())
  const [stationName, setStationName] = useState(() => getLocalDeviceName())
  const [isStandalone, setIsStandalone] = useState(() => isRunningStandalone())
  const [canInstall, setCanInstall] = useState(() => canInstallApp())

  // Manager Authorization State
  const currentUser = getCurrentUser()
  const userIsManager = isManagerOrAdmin(currentUser?.role)
  const [managerAuthorized, setManagerAuthorized] = useState(() => userIsManager)
  const [managerPin, setManagerPin] = useState('')
  const [managerPinError, setManagerPinError] = useState<string | null>(null)

  useEffect(() => {
    const unsubMaster = subscribeMasterTerminal((info) => {
      setMasterInfo(info)
      setIsMaster(isMasterTerminal())
    })
    const unsubInstall = subscribeInstallPrompt((avail) => {
      setCanInstall(avail)
      setIsStandalone(isRunningStandalone())
    })
    return () => {
      unsubMaster()
      unsubInstall()
    }
  }, [])

  if (!isOpen) return null

  const handleVerifyManagerPin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!managerPin.trim()) return
    const res = await verifyManagerPinAsync(managerPin)
    if (res.ok) {
      playPOSTouchTone('action')
      setManagerAuthorized(true)
      setManagerPinError(null)
    } else {
      playPOSTouchTone('numpad')
      setManagerPinError(res.message || 'Invalid Manager PIN.')
      setManagerPin('')
    }
  }

  const handleEnrollMaster = () => {
    playPOSTouchTone('action')
    const actor = currentUser?.name || 'Store Manager'
    enrollAndClaimMasterTerminal(actor, stationName)
    onFlash?.(`✅ Hardware Station "${stationName}" successfully enrolled as Master Till!`)
  }

  const handleTransferMaster = () => {
    playPOSTouchTone('action')
    const actor = currentUser?.name || 'Store Manager'
    releaseMasterTerminal(actor)
    enrollAndClaimMasterTerminal(actor, stationName)
    onFlash?.(`✅ Master Register Authority transferred to this workstation!`)
  }

  const handleInstallClick = async () => {
    playPOSTouchTone('tap')
    const res = await triggerInstallPrompt()
    if (res?.outcome === 'accepted') {
      onFlash?.('📲 Software installation started!')
    }
  }

  const handleDownloadLauncher = (platform: 'windows' | 'mac' | 'linux') => {
    playPOSTouchTone('tap')
    downloadDesktopLauncher(platform)
    onFlash?.(`📥 Downloaded ${platform.toUpperCase()} till launcher script!`)
  }

  const enrollmentToken = getLocalEnrollmentToken()
  const deviceId = getLocalDeviceId()

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-md font-body select-none">
      <div className="relative w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl border border-amber-500/40 bg-slate-900 text-white shadow-2xl p-5 sm:p-6 space-y-5">
        
        {/* CLOSE BUTTON */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition"
        >
          ✕
        </button>

        {/* MODAL HEADER */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-2xl text-slate-950 font-black shadow-lg">
            🛡️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white uppercase tracking-wider">
                Store Terminal Authority &amp; Software
              </h2>
              <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300 border border-amber-400/30">
                Authorized Hardware
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Station hardware pairing, single register authority &amp; offline launchers
            </p>
          </div>
        </div>

        {/* MANAGER AUTHORIZATION GATE (IF NOT ALREADY AUTHORIZED) */}
        {!managerAuthorized ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-center space-y-4">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/20 text-2xl text-amber-300">
              🔑
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Manager Authorization Required</h3>
              <p className="text-xs text-slate-300 mt-1">
                Downloading till software or altering hardware station authority requires Store Owner or Manager approval.
              </p>
            </div>

            <form onSubmit={handleVerifyManagerPin} className="max-w-xs mx-auto space-y-3">
              <input
                type="password"
                maxLength={6}
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value)}
                placeholder="Manager PIN"
                autoFocus
                className="w-full rounded-xl border border-amber-400/40 bg-slate-950 py-2.5 text-center font-mono text-2xl tracking-[0.4em] text-white focus:border-amber-400 focus:outline-none"
              />
              {managerPinError && (
                <p className="text-xs font-semibold text-rose-400">{managerPinError}</p>
              )}
              <button
                type="submit"
                className="w-full rounded-xl bg-amber-400 py-2.5 font-body text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-300 transition"
              >
                Authorize Hardware Station &rarr;
              </button>
            </form>
          </div>
        ) : (
          /* AUTHORIZED MANAGEMENT PANEL */
          <div className="space-y-5">
            
            {/* SECTION 1: MASTER REGISTER AUTHORITY STATUS */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                  1. Register Authority Status
                </span>
                {isMaster ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Master Register (Active)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-bold text-rose-300 border border-rose-500/30">
                    <span className="h-2 w-2 rounded-full bg-rose-400" />
                    Secondary Screen (Orders Only)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-white/5 p-2.5">
                  <p className="text-slate-400 text-[11px]">Hardware Device ID</p>
                  <p className="font-mono font-bold text-slate-200 truncate">{deviceId}</p>
                </div>
                <div className="rounded-xl bg-white/5 p-2.5">
                  <p className="text-slate-400 text-[11px]">Enrolled Token</p>
                  <p className="font-mono font-bold text-amber-300 truncate">
                    {enrollmentToken || 'Not yet enrolled'}
                  </p>
                </div>
              </div>

              {/* Station Nickname Input */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Station Friendly Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={stationName}
                    onChange={(e) => {
                      setStationName(e.target.value)
                      setLocalDeviceName(e.target.value)
                    }}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                    placeholder="e.g. Counter Till #1"
                  />
                  {!isMaster ? (
                    <button
                      type="button"
                      onClick={handleTransferMaster}
                      className="rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-300 transition"
                    >
                      Make Master Till
                    </button>
                  ) : !enrollmentToken ? (
                    <button
                      type="button"
                      onClick={handleEnrollMaster}
                      className="rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-amber-300 transition"
                    >
                      Enroll Station
                    </button>
                  ) : null}
                </div>
              </div>

              {masterInfo && !isMaster && (
                <p className="text-[11px] text-rose-300 bg-rose-950/40 border border-rose-500/20 rounded-xl p-2">
                  🔒 Register authority is currently bound to <strong>{masterInfo.name}</strong>. Transferring authority here will switch that machine into Kitchen Expediter mode.
                </p>
              )}
            </div>

            {/* SECTION 2: STANDALONE SOFTWARE INSTALLATION */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 space-y-3">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                2. Install Standalone Software Program
              </span>
              <p className="text-xs text-slate-300">
                Runs Just Spuds POS in a distraction-free, dedicated full-screen software window without browser tabs or address bars.
              </p>

              {isStandalone ? (
                <div className="rounded-xl bg-emerald-950/50 border border-emerald-500/30 p-3 text-xs text-emerald-300 flex items-center gap-2">
                  <span>✅</span>
                  <span><strong>Standalone Mode Active:</strong> This terminal is currently running inside the dedicated software window!</span>
                </div>
              ) : canInstall ? (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 py-3 text-xs font-black uppercase tracking-wider text-slate-950 shadow-glow hover:from-amber-400 hover:to-amber-300 transition flex items-center justify-center gap-2"
                >
                  <span>📲</span>
                  <span>Install Official POS App on this Computer &rarr;</span>
                </button>
              ) : (
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-slate-300 space-y-2">
                  <p className="font-bold text-white">Manual Standalone Window Setup:</p>
                  <p className="text-slate-400 leading-relaxed">
                    Look at the far right of your browser address bar next to the star (⭐). Click the <span className="text-amber-300 font-mono">💻 (Install)</span> monitor icon or click Chrome menu (⋮) &rarr; <strong>Save and share</strong> &rarr; <strong>Install Just Spuds...</strong>
                  </p>
                </div>
              )}
            </div>

            {/* SECTION 3: DOWNLOAD DESKTOP LAUNCHERS (.BAT / .COMMAND / .SH) */}
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 space-y-3">
              <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                3. Download Native Desktop Launchers
              </span>
              <p className="text-xs text-slate-300">
                Download a pre-configured 1-click startup shortcut for Windows, macOS, or Linux kiosks:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadLauncher('windows')}
                  className="rounded-xl border border-white/15 bg-white/5 p-3 text-left hover:bg-white/10 hover:border-amber-400/50 transition group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg">🪟</span>
                    <span className="text-[10px] font-bold text-amber-400 uppercase">.BAT</span>
                  </div>
                  <p className="text-xs font-bold text-white group-hover:text-amber-300">Windows Till</p>
                  <p className="text-[10px] text-slate-400">Launch-Store-POS.bat</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadLauncher('mac')}
                  className="rounded-xl border border-white/15 bg-white/5 p-3 text-left hover:bg-white/10 hover:border-amber-400/50 transition group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg">🍎</span>
                    <span className="text-[10px] font-bold text-amber-400 uppercase">.COMMAND</span>
                  </div>
                  <p className="text-xs font-bold text-white group-hover:text-amber-300">macOS Station</p>
                  <p className="text-[10px] text-slate-400">Launch-Store-POS.command</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadLauncher('linux')}
                  className="rounded-xl border border-white/15 bg-white/5 p-3 text-left hover:bg-white/10 hover:border-amber-400/50 transition group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg">🐧</span>
                    <span className="text-[10px] font-bold text-amber-400 uppercase">.SH</span>
                  </div>
                  <p className="text-xs font-bold text-white group-hover:text-amber-300">Linux / Pi</p>
                  <p className="text-[10px] text-slate-400">Launch-Store-POS.sh</p>
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20 transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
