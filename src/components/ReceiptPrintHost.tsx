import { useEffect, useRef, useState } from 'react'
import PrintSlip, { printSlip } from './PrintSlip'
import ReceiptPaper from './ReceiptPaper'
import { finishPrintJob, subscribePrintJobs, type PrintJob } from '../services/receiptPrinter'

/**
 * Prints browser-route slips (services/receiptPrinter). Mounted once at the
 * app root. The print area stays mounted, so a new slip is on the page in the
 * same render that receives it, and printing starts right after — no preview
 * pop-up in between. (Mounting the area per job raced the print: it printed
 * an empty slip.) The last slip stays in the hidden area afterwards, so a
 * browser that prints asynchronously still has it.
 */
export default function ReceiptPrintHost() {
  const [job, setJob] = useState<PrintJob | null>(null)
  const printed = useRef(0)

  useEffect(
    () =>
      subscribePrintJobs((next) => {
        if (next) setJob(next)
      }),
    [],
  )

  useEffect(() => {
    if (!job || printed.current === job.id) return
    printed.current = job.id
    const el = document.getElementById('print-slip-receipt-job')
    if (el && !el.textContent) {
      // The portal target was created this render; print on the next frame.
      const raf = requestAnimationFrame(() => {
        printSlip('receipt-job')
        finishPrintJob(job.id)
      })
      return () => cancelAnimationFrame(raf)
    }
    printSlip('receipt-job')
    finishPrintJob(job.id)
  }, [job])

  return <PrintSlip id="receipt-job" widthMm={job?.widthMm}>{job ? <ReceiptPaper blocks={job.blocks} widthMm={job.widthMm} /> : null}</PrintSlip>
}
