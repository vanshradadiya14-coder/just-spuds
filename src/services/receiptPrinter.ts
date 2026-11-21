/**
 * PRINTING — one call per slip, no preview, no clicks.
 *
 *  1. A receipt printer connected directly (Till settings › Printer › USB or
 *     serial) gets ESC/POS bytes: prints instantly, cuts the paper, no dialog.
 *  2. Otherwise the slip goes to the Windows / Android printer through the
 *     browser. Started with --kiosk-printing (Till settings shows how) that is
 *     silent too; without it the browser shows its print dialog once per slip.
 *
 * The <ReceiptPrintHost/> mounted at the app root renders browser jobs.
 */
import { getBusinessDetails } from './menuStore'
import { isVatRegistered, orderVat } from './vat'
import type { Order } from './orderStore'
import type { EndOfDayReport } from './endOfDayReport'
import { getPrinterPrefs, isDirectPrinterReady, paperWidthMm, restoreDirectPrinter, writeToPrinter } from './printerBridge'
import { customerReceiptDoc, endOfDayDoc, kitchenTicketDoc, receiptEscPos, type CustomerReceiptOptions, type ReceiptBlock } from './receiptDoc'

export interface PrintJob {
  id: number
  title: string
  blocks: ReceiptBlock[]
  widthMm: number
}

export interface PrintResult {
  ok: boolean
  via: 'direct' | 'browser'
  message: string
}

let jobSeq = 0
let currentJob: PrintJob | null = null
const jobListeners = new Set<(job: PrintJob | null) => void>()

export function subscribePrintJobs(listener: (job: PrintJob | null) => void): () => void {
  jobListeners.add(listener)
  listener(currentJob)
  return () => jobListeners.delete(listener)
}

/** Called by the host once the browser has the job. */
export function finishPrintJob(id: number) {
  if (currentJob?.id === id) {
    currentJob = null
    jobListeners.forEach((l) => l(null))
  }
}

function business() {
  const b = getBusinessDetails()
  return { name: b.name, addressLines: b.addressLines, phone: b.phone, vatNumber: b.vatNumber }
}

/** Sends a slip to the printer: direct when connected, else the browser. */
export async function printBlocks(blocks: ReceiptBlock[], opts: { title: string; kickDrawer?: boolean } = { title: 'Receipt' }): Promise<PrintResult> {
  const prefs = getPrinterPrefs()
  if (prefs.mode !== 'browser') {
    if (!isDirectPrinterReady()) await restoreDirectPrinter()
    if (isDirectPrinterReady()) {
      try {
        for (let i = 0; i < prefs.copies; i++) {
          await writeToPrinter(receiptEscPos(blocks, prefs.cols, { kickDrawer: Boolean(opts.kickDrawer) && i === 0 }))
        }
        return { ok: true, via: 'direct', message: `${opts.title} printed` }
      } catch (err) {
        console.warn('Direct print failed, using the browser:', err)
      }
    }
  }
  if (typeof window === 'undefined') return { ok: false, via: 'browser', message: 'No printer here' }
  currentJob = { id: ++jobSeq, title: opts.title, blocks, widthMm: paperWidthMm(prefs.cols) }
  jobListeners.forEach((l) => l(currentJob))
  return {
    ok: jobListeners.size > 0,
    via: 'browser',
    message: prefs.mode === 'browser' ? `${opts.title} sent to the printer` : `Receipt printer not found — ${opts.title.toLowerCase()} sent to the Windows printer`,
  }
}

/** The customer's receipt as blocks — also used for the on-screen preview. */
export function receiptBlocks(order: Order, opts: Omit<CustomerReceiptOptions, 'business' | 'vatBands'> = {}): ReceiptBlock[] {
  const biz = business()
  return customerReceiptDoc(order, {
    ...opts,
    business: biz,
    vatBands: biz.vatNumber && isVatRegistered() ? orderVat(order).bands : undefined,
  })
}

export function printOrderReceipt(order: Order, opts: Omit<CustomerReceiptOptions, 'business' | 'vatBands'> = {}): Promise<PrintResult> {
  return printBlocks(receiptBlocks(order, opts), { title: opts.kind === 'bill' ? 'Bill' : 'Receipt' })
}

export function printKitchenTicket(order: Order): Promise<PrintResult> {
  return printBlocks(kitchenTicketDoc(order), { title: 'Kitchen ticket' })
}

export function printEndOfDayReport(report: EndOfDayReport): Promise<PrintResult> {
  return printBlocks(endOfDayDoc(report, business()), { title: report.kind === 'Z' ? 'End of day report' : 'X read' })
}

export { paperWidthMm }
