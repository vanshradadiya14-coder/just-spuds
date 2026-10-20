/**
 * MASTER TERMINAL AUTHORITY & CONFLICT PREVENTION STORE
 * ------------------------------------------------------
 * Ensures that only ONE designated in-store device operates as the "Master Till Register",
 * preventing cash float conflicts, split-brain ticket sequences, and multiple drawers.
 *
 * Secondary devices (kitchen tablets, expediter, manager mobile) automatically operate
 * in Kitchen Flow / Viewer mode. Authority can be transferred using a Manager PIN.
 */

import { logAuditEvent } from './auditStore'

const STORAGE_DEVICE_ID = 'just_spuds_terminal_device_id_v1'
const STORAGE_DEVICE_NAME = 'just_spuds_terminal_device_name_v1'
const STORAGE_MASTER_TERMINAL = 'just_spuds_master_terminal_v1'

export interface MasterTerminalInfo {
  id: string
  name: string
  claimedAt: string
  claimedBy?: string
}

let channel: BroadcastChannel | null = null
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  channel = new BroadcastChannel('just_spuds_terminal_bus')
  channel.onmessage = (e) => {
    if (e.data?.type === 'MASTER_CLAIMED' || e.data?.type === 'MASTER_RELEASED') {
      notifyListeners()
    }
  }
}

const listeners = new Set<(info: MasterTerminalInfo | null) => void>()

function notifyListeners() {
  const current = getMasterTerminalInfo()
  listeners.forEach((fn) => fn(current))
}

/** Get or create persistent unique ID for this physical device */
export function getLocalDeviceId(): string {
  if (typeof window === 'undefined') return 'server'
  let id = localStorage.getItem(STORAGE_DEVICE_ID)
  if (!id) {
    id = `terminal_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`
    localStorage.setItem(STORAGE_DEVICE_ID, id)
  }
  return id
}

/** Get or set friendly device nickname */
export function getLocalDeviceName(): string {
  if (typeof window === 'undefined') return 'Terminal'
  let name = localStorage.getItem(STORAGE_DEVICE_NAME)
  if (!name) {
    const isWindows = /Win/i.test(navigator.userAgent)
    const isMac = /Mac/i.test(navigator.userAgent)
    const isLinux = /Linux/i.test(navigator.userAgent)
    const isAndroid = /Android/i.test(navigator.userAgent)
    const isIPad = /iPad|Macintosh/i.test(navigator.userAgent) && 'ontouchend' in document
    const os = isWindows ? 'Windows' : isMac ? 'Mac' : isIPad ? 'iPad' : isAndroid ? 'Android' : isLinux ? 'Linux' : 'Device'
    name = `Store Counter Till (${os})`
    localStorage.setItem(STORAGE_DEVICE_NAME, name)
  }
  return name
}

export function setLocalDeviceName(name: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_DEVICE_NAME, name.trim())
}

/** Read current master terminal record */
export function getMasterTerminalInfo(): MasterTerminalInfo | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_MASTER_TERMINAL)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Returns true if this device is the authorized Master Till, or if no master has been set yet */
export function isMasterTerminal(): boolean {
  const master = getMasterTerminalInfo()
  if (!master) return true // First device automatically claims or can register
  return master.id === getLocalDeviceId()
}

/** Claims master terminal role for this physical system */
export function claimMasterTerminal(actor: string = 'Staff', customName?: string): void {
  if (typeof window === 'undefined') return
  const id = getLocalDeviceId()
  const name = customName || getLocalDeviceName()
  const info: MasterTerminalInfo = {
    id,
    name,
    claimedAt: new Date().toISOString(),
    claimedBy: actor,
  }
  localStorage.setItem(STORAGE_MASTER_TERMINAL, JSON.stringify(info))
  channel?.postMessage({ type: 'MASTER_CLAIMED', info })
  logAuditEvent(actor, 'terminal.claim', 'Master Terminal Claimed', `Station "${name}" (ID: ${id}) claimed active register authority.`)
  notifyListeners()
}

/** Releases master terminal role so another system can take over */
export function releaseMasterTerminal(actor: string): void {
  if (typeof window === 'undefined') return
  const prev = getMasterTerminalInfo()
  localStorage.removeItem(STORAGE_MASTER_TERMINAL)
  channel?.postMessage({ type: 'MASTER_RELEASED' })
  logAuditEvent(actor, 'terminal.release', 'Master Terminal Released', `Station "${prev?.name || 'Till'}" released register authority.`)
  notifyListeners()
}

/** Subscribe to master terminal state changes */
export function subscribeMasterTerminal(callback: (info: MasterTerminalInfo | null) => void): () => void {
  listeners.add(callback)
  callback(getMasterTerminalInfo())
  return () => {
    listeners.delete(callback)
  }
}
