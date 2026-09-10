/**
 * CUSTOMER-FACING DISPLAY (CFD) EVENT BUS
 * ---------------------------------------
 * Powers secondary counter-facing screens (iPads, customer tablets, dual-pole POS screens).
 * Real-time synchronization via BroadcastChannel with localStorage fallback.
 */

import type { CartLine } from '../hooks/useCart'

export interface CFDTicketState {
  lines: CartLine[]
  subtotalPence: number
  discountPence: number
  totalDuePence: number
  orderType: 'takeaway' | 'eat_in' | 'phone'
  customerName?: string
  buzzerNumber?: string
  tableNumber?: string
  status: 'idle' | 'ordering' | 'tender' | 'paid'
  tenderMethod?: string
  tenderedCashPence?: number
  changeDuePence?: number
  completedOrderShortId?: string
  timestamp: string
}

export const EMPTY_CFD_STATE: CFDTicketState = {
  lines: [],
  subtotalPence: 0,
  discountPence: 0,
  totalDuePence: 0,
  orderType: 'takeaway',
  customerName: '',
  buzzerNumber: '',
  tableNumber: '',
  status: 'idle',
  timestamp: new Date().toISOString(),
}

const CFD_STORAGE_KEY = 'just_spuds_cfd_state_v1'
let currentCFDState: CFDTicketState = EMPTY_CFD_STATE

const listeners = new Set<(state: CFDTicketState) => void>()

let cfdChannel: BroadcastChannel | null = null
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  cfdChannel = new BroadcastChannel('just_spuds_cfd_bus')
  cfdChannel.onmessage = (event) => {
    if (event.data?.type === 'CFD_UPDATE' && event.data.payload) {
      currentCFDState = event.data.payload
      notifyListeners()
    }
  }
}

// Initial hydration from localStorage
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(CFD_STORAGE_KEY)
    if (raw) {
      currentCFDState = JSON.parse(raw)
    }
  } catch {}
}

function notifyListeners() {
  listeners.forEach((l) => l({ ...currentCFDState }))
}

export function getCFDState(): CFDTicketState {
  return { ...currentCFDState }
}

export function broadcastCFDState(state: Partial<CFDTicketState>): void {
  currentCFDState = {
    ...currentCFDState,
    ...state,
    timestamp: new Date().toISOString(),
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CFD_STORAGE_KEY, JSON.stringify(currentCFDState))
    } catch {}
  }

  cfdChannel?.postMessage({
    type: 'CFD_UPDATE',
    payload: currentCFDState,
  })

  notifyListeners()
}

export function resetCFDState(): void {
  broadcastCFDState({
    ...EMPTY_CFD_STATE,
    timestamp: new Date().toISOString(),
  })
}

export function subscribeCFDState(listener: (state: CFDTicketState) => void): () => void {
  listeners.add(listener)
  listener({ ...currentCFDState })
  return () => listeners.delete(listener)
}
