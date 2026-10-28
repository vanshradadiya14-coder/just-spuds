/**
 * MASTER TERMINAL AUTHORITY & HARDWARE STATION ENROLLMENT
 * --------------------------------------------------------
 * Ensures that only ONE designated in-store hardware device operates as the "Master Till Register",
 * preventing cash float conflicts, split-brain ticket sequences, and multiple drawers.
 *
 * Provides cryptographic station pairing keys and single-authority hardware locks
 * that only authorized store managers can enroll, transfer, or download software for.
 */

import { logAuditEvent } from './auditStore'
import { getDocSyncState, isCloudSyncConfigured, markDocChanged, registerDoc, syncNow } from './cloudSync'
import { sha256Hex } from '../utils/sha256'

const STORAGE_DEVICE_ID = 'just_spuds_terminal_device_id_v1'
const STORAGE_DEVICE_NAME = 'just_spuds_terminal_device_name_v1'
const STORAGE_MASTER_TERMINAL = 'just_spuds_master_terminal_v1'
const STORAGE_ENROLLMENT_TOKEN = 'just_spuds_terminal_enrollment_token_v1'
const STORAGE_TERMINAL_REGISTRY = 'just_spuds_terminal_registry_v1'
const TERMINAL_REGISTRY_DOC = 'terminal.registry'

export type StationRole = 'master_till' | 'kds_display' | 'secondary_till'

export interface MasterTerminalInfo {
  id: string
  name: string
  claimedAt: string
  claimedBy?: string
  enrollmentToken?: string
}

export interface EnrolledTerminalRecord {
  deviceId: string
  name: string
  stationRole: StationRole
  tokenHash: string
  enrolledAt: string
  enrolledBy: string
}

export interface TerminalRegistryDoc {
  /** When true, /pos, /till, and /staff require the physical device to be enrolled by an Admin. */
  enforceStoreHardwareLock: boolean
  masterTerminal: MasterTerminalInfo | null
  enrolledTerminals: EnrolledTerminalRecord[]
  /** Optional salted SHA-256 hash ("salt$hash") of a secondary Admin Master Passkey required for /admin. */
  adminPasskeyHash?: string
  updatedAt: string
}

function defaultRegistry(): TerminalRegistryDoc {
  return {
    enforceStoreHardwareLock: true,
    masterTerminal: null,
    enrolledTerminals: [],
    updatedAt: new Date().toISOString(),
  }
}

function readRegistry(): TerminalRegistryDoc {
  if (typeof window === 'undefined') return defaultRegistry()
  try {
    const raw = localStorage.getItem(STORAGE_TERMINAL_REGISTRY)
    if (!raw) return defaultRegistry()
    const parsed = JSON.parse(raw) as Partial<TerminalRegistryDoc>
    return {
      enforceStoreHardwareLock: parsed.enforceStoreHardwareLock ?? true,
      masterTerminal: parsed.masterTerminal ?? null,
      enrolledTerminals: Array.isArray(parsed.enrolledTerminals) ? parsed.enrolledTerminals : [],
      adminPasskeyHash: parsed.adminPasskeyHash,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    }
  } catch {
    return defaultRegistry()
  }
}

function writeRegistry(doc: TerminalRegistryDoc): void {
  if (typeof window === 'undefined') return
  const next = { ...doc, updatedAt: new Date().toISOString() }
  localStorage.setItem(STORAGE_TERMINAL_REGISTRY, JSON.stringify(next))
  if (next.masterTerminal) {
    localStorage.setItem(STORAGE_MASTER_TERMINAL, JSON.stringify(next.masterTerminal))
  } else {
    localStorage.removeItem(STORAGE_MASTER_TERMINAL)
  }
  markDocChanged(TERMINAL_REGISTRY_DOC)
  notifyListeners()
}

let channel: BroadcastChannel | null = null
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  channel = new BroadcastChannel('just_spuds_terminal_bus')
  channel.onmessage = (e) => {
    if (e.data?.type === 'MASTER_CLAIMED' || e.data?.type === 'MASTER_RELEASED' || e.data?.type === 'TERMINAL_ENROLLED') {
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
    id = `term_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`
    localStorage.setItem(STORAGE_DEVICE_ID, id)
  }
  return id
}

/** Get friendly device nickname */
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
  notifyListeners()
}

/** Returns the local enrollment pairing token if enrolled */
export function getLocalEnrollmentToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(STORAGE_ENROLLMENT_TOKEN)
}

/** Check if this specific physical device has been enrolled as an official store workstation */
export function isTerminalEnrolled(): boolean {
  const token = getLocalEnrollmentToken()
  if (!token) return false
  const reg = readRegistry()
  if (reg.enrolledTerminals.length === 0) return true
  const id = getLocalDeviceId()
  const hash = sha256Hex(token)
  return reg.enrolledTerminals.some((t) => t.deviceId === id && t.tokenHash === hash)
}

/** Whether /pos, /till, and /staff require an Admin-enrolled store device */
export function isStoreHardwareLockEnforced(): boolean {
  return readRegistry().enforceStoreHardwareLock
}

export function setStoreHardwareLockEnforced(enforced: boolean, actor: string): void {
  const reg = readRegistry()
  writeRegistry({ ...reg, enforceStoreHardwareLock: enforced })
  logAuditEvent(
    actor,
    'terminal.lock_policy',
    'Store Hardware Lock Policy',
    `In-store hardware enrollment requirement set to ${enforced ? 'ENFORCED' : 'OPEN'}.`,
  )
}

export function getEnrolledTerminals(): EnrolledTerminalRecord[] {
  return readRegistry().enrolledTerminals.map((t) => ({ ...t }))
}

/** Read current master terminal record */
export function getMasterTerminalInfo(): MasterTerminalInfo | null {
  if (typeof window === 'undefined') return null
  const reg = readRegistry()
  if (reg.masterTerminal) return reg.masterTerminal
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

/** Enroll and bind this physical system as an authorized store workstation (and Master Till by default) */
export function enrollAndClaimMasterTerminal(
  actor: string = 'Store Manager',
  customName?: string,
  stationRole: StationRole = 'master_till',
): string {
  if (typeof window === 'undefined') return ''
  const id = getLocalDeviceId()
  const name = (customName || getLocalDeviceName()).trim() || 'Store Counter Till'
  const token = `JSP-REG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  const now = new Date().toISOString()

  localStorage.setItem(STORAGE_ENROLLMENT_TOKEN, token)
  localStorage.setItem(STORAGE_DEVICE_NAME, name)

  const reg = readRegistry()
  const record: EnrolledTerminalRecord = {
    deviceId: id,
    name,
    stationRole,
    tokenHash: sha256Hex(token),
    enrolledAt: now,
    enrolledBy: actor,
  }

  const others = reg.enrolledTerminals.filter((t) => t.deviceId !== id)
  // Only a till enrolled as the master till takes the cash-drawer authority; a
  // kitchen screen enrolled first must not quietly become the master register.
  const info: MasterTerminalInfo | null =
    stationRole === 'master_till'
      ? {
          id,
          name,
          claimedAt: now,
          claimedBy: actor,
          enrollmentToken: token,
        }
      : reg.masterTerminal

  writeRegistry({
    ...reg,
    masterTerminal: info,
    enrolledTerminals: [record, ...others],
  })

  channel?.postMessage({ type: 'MASTER_CLAIMED', info })
  logAuditEvent(
    actor,
    'terminal.enroll',
    'Hardware Station Enrolled',
    `Station "${name}" (ID: ${id}, Role: ${stationRole}, Token: ${token}) enrolled as official store terminal.`,
  )
  notifyListeners()
  return token
}

/**
 * Enrol this device, after making sure it holds the shop's current terminal
 * list. Enrolling from an empty local copy would publish a registry with only
 * this device in it — newer by timestamp, so it would replace the server's and
 * un-enrol every other till (and drop the admin passkey).
 */
export async function enrollThisDevice(
  actor: string,
  customName?: string,
  stationRole: StationRole = 'master_till',
): Promise<{ ok: boolean; message: string }> {
  if (isCloudSyncConfigured()) {
    await syncNow().catch(() => false)
    if (getDocSyncState(TERMINAL_REGISTRY_DOC) === 'unknown') {
      return { ok: false, message: "Couldn't reach the server to load this shop's till list. Check the internet connection and try again." }
    }
  }
  enrollAndClaimMasterTerminal(actor, customName, stationRole)
  return { ok: true, message: 'This device is now an enrolled store terminal.' }
}

/** Revoke an enrolled terminal remotely or locally so it can no longer open /pos or /staff */
export function revokeEnrolledTerminal(deviceId: string, actor: string): void {
  if (typeof window === 'undefined') return
  const reg = readRegistry()
  const target = reg.enrolledTerminals.find((t) => t.deviceId === deviceId)
  const remaining = reg.enrolledTerminals.filter((t) => t.deviceId !== deviceId)
  const nextMaster = reg.masterTerminal?.id === deviceId ? null : reg.masterTerminal

  if (deviceId === getLocalDeviceId()) {
    localStorage.removeItem(STORAGE_ENROLLMENT_TOKEN)
  }

  writeRegistry({
    ...reg,
    masterTerminal: nextMaster,
    enrolledTerminals: remaining,
  })
  channel?.postMessage({ type: 'MASTER_RELEASED' })
  logAuditEvent(
    actor,
    'terminal.revoke',
    'Store Terminal Revoked',
    `Revoked store terminal "${target?.name || deviceId}" (${deviceId}).`,
  )
}

/** Claims master terminal role for this physical system */
export function claimMasterTerminal(actor: string = 'Staff', customName?: string): void {
  enrollAndClaimMasterTerminal(actor, customName, 'master_till')
}

/** Releases master terminal role so another system can take over */
export function releaseMasterTerminal(actor: string): void {
  if (typeof window === 'undefined') return
  const prev = getMasterTerminalInfo()
  const reg = readRegistry()
  writeRegistry({ ...reg, masterTerminal: null })
  channel?.postMessage({ type: 'MASTER_RELEASED' })
  logAuditEvent(actor, 'terminal.release', 'Master Terminal Released', `Station "${prev?.name || 'Till'}" released register authority.`)
  notifyListeners()
}

// ---------------------------------------------------------------------------
// Secondary Admin Master Passkey (Optional 2-Factor Gate for /admin)
// ---------------------------------------------------------------------------

function hashPasskey(passkey: string, salt: string): string {
  let h = `${salt}:admin_passkey:${passkey.trim()}`
  for (let i = 0; i < 4000; i++) h = sha256Hex(`${salt}${h}`)
  return h
}

export function hasAdminPasskey(): boolean {
  return Boolean(readRegistry().adminPasskeyHash)
}

export function setAdminPasskey(passkey: string, actor: string): { ok: boolean; message: string } {
  const clean = passkey.trim()
  if (clean.length < 4) {
    return { ok: false, message: 'Admin Master Passkey must be at least 4 characters.' }
  }
  const salt = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  const stored = `${salt}$${hashPasskey(clean, salt)}`
  const reg = readRegistry()
  writeRegistry({ ...reg, adminPasskeyHash: stored })
  logAuditEvent(actor, 'security.admin_passkey_set', 'Admin Master Passkey', 'Secondary Admin Master Passkey enabled/updated.')
  return { ok: true, message: 'Admin Master Passkey saved and active across all devices.' }
}

export function clearAdminPasskey(actor: string): void {
  const reg = readRegistry()
  const next = { ...reg }
  delete next.adminPasskeyHash
  writeRegistry(next)
  logAuditEvent(actor, 'security.admin_passkey_cleared', 'Admin Master Passkey', 'Secondary Admin Master Passkey removed.')
}

export function verifyAdminPasskey(passkey: string): boolean {
  const stored = readRegistry().adminPasskeyHash
  if (!stored) return true
  if (!stored.includes('$')) return false
  const [salt, expected] = stored.split('$')
  return hashPasskey(passkey.trim(), salt) === expected
}

/** Subscribe to master terminal state changes */
export function subscribeMasterTerminal(callback: (info: MasterTerminalInfo | null) => void): () => void {
  listeners.add(callback)
  callback(getMasterTerminalInfo())
  return () => {
    listeners.delete(callback)
  }
}

if (typeof window !== 'undefined') {
  registerDoc({
    name: TERMINAL_REGISTRY_DOC,
    storageKey: STORAGE_TERMINAL_REGISTRY,
    private: true,
    notify: () => {
      const reg = readRegistry()
      if (reg.masterTerminal) {
        localStorage.setItem(STORAGE_MASTER_TERMINAL, JSON.stringify(reg.masterTerminal))
      } else {
        localStorage.removeItem(STORAGE_MASTER_TERMINAL)
      }
      notifyListeners()
    },
  })
}

/**
 * Generates and triggers direct browser download of the native desktop launcher script
 * for Windows, macOS, or Linux. Only accessible inside authenticated manager controls.
 */
export function downloadDesktopLauncher(platform: 'windows' | 'mac' | 'linux'): void {
  if (typeof window === 'undefined') return

  let filename = 'Launch-Store-POS.bat'
  let mimeType = 'text/plain'
  let content = ''

  if (platform === 'windows') {
    filename = 'Launch-Store-POS.bat'
    content = `@echo off
title Just Spuds In-Store Master POS Terminal
color 0E
echo ===================================================
echo     JUST SPUDS AYLESBURY - MASTER POS TILL
echo ===================================================
echo Starting dedicated POS App window...

start msedge --app=https://pos.justspuds.uk --start-maximized 2>nul
if %errorlevel% neq 0 (
    start chrome --app=https://pos.justspuds.uk --start-maximized 2>nul
)
if %errorlevel% neq 0 (
    start https://pos.justspuds.uk
)
exit
`
  } else if (platform === 'mac') {
    filename = 'Launch-Store-POS.command'
    content = `#!/bin/bash
# Just Spuds macOS POS Launcher
open -na "Google Chrome" --args --app="https://pos.justspuds.uk" 2>/dev/null || open -na "Brave Browser" --args --app="https://pos.justspuds.uk" 2>/dev/null || open "https://pos.justspuds.uk"
`
  } else {
    filename = 'Launch-Store-POS.sh'
    content = `#!/usr/bin/env bash
# Just Spuds Linux / Touchscreen Kiosk Launcher
chromium --app="https://pos.justspuds.uk" --start-maximized 2>/dev/null || google-chrome --app="https://pos.justspuds.uk" --start-maximized 2>/dev/null || xdg-open "https://pos.justspuds.uk"
`
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
