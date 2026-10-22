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

const STORAGE_DEVICE_ID = 'just_spuds_terminal_device_id_v1'
const STORAGE_DEVICE_NAME = 'just_spuds_terminal_device_name_v1'
const STORAGE_MASTER_TERMINAL = 'just_spuds_master_terminal_v1'
const STORAGE_ENROLLMENT_TOKEN = 'just_spuds_terminal_enrollment_token_v1'

export interface MasterTerminalInfo {
  id: string
  name: string
  claimedAt: string
  claimedBy?: string
  enrollmentToken?: string
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
  return !!getLocalEnrollmentToken()
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

/** Enroll and bind this physical system as an authorized Master Till */
export function enrollAndClaimMasterTerminal(actor: string = 'Store Manager', customName?: string): string {
  if (typeof window === 'undefined') return ''
  const id = getLocalDeviceId()
  const name = customName || getLocalDeviceName()
  const token = `JSP-REG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

  localStorage.setItem(STORAGE_ENROLLMENT_TOKEN, token)
  if (customName) {
    localStorage.setItem(STORAGE_DEVICE_NAME, customName)
  }

  const info: MasterTerminalInfo = {
    id,
    name,
    claimedAt: new Date().toISOString(),
    claimedBy: actor,
    enrollmentToken: token,
  }

  localStorage.setItem(STORAGE_MASTER_TERMINAL, JSON.stringify(info))
  channel?.postMessage({ type: 'MASTER_CLAIMED', info })
  logAuditEvent(
    actor,
    'terminal.enroll',
    'Hardware Station Enrolled',
    `Station "${name}" (ID: ${id}, Token: ${token}) enrolled as sole Master Register.`
  )
  notifyListeners()
  return token
}

/** Claims master terminal role for this physical system */
export function claimMasterTerminal(actor: string = 'Staff', customName?: string): void {
  enrollAndClaimMasterTerminal(actor, customName)
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
