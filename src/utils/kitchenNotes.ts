/**
 * The till stamps bookkeeping into an order's kitchen notes
 * ("[POS TILL #01] TAKEAWAY • OPEN CHECK • Cashier: Chloe • Buzzer #4").
 * The kitchen only needs the real instruction in the allergen box; the rest
 * belongs in small chips. Buzzer / table chips stay prominent — the pass needs them.
 */
export interface ParsedKitchenNotes {
  /** Buzzer / table — shown loud. */
  callouts: string[]
  /** Order type, cashier, till id — shown quiet. */
  meta: string[]
  /** Free-text instruction from the customer or cashier. */
  note: string
}

const META_PATTERN = /^(TAKEAWAY|EAT[ _]?IN|PHONE|OPEN CHECK|CASHIER:|POS TILL|TILL ORDER|PHONE ORDER|STAFF ORDER|WEBSITE|TILL|STAFF|COUNTER)/i
const CALLOUT_PATTERN = /(BUZZER|TABLE|TBL)\s*#?\s*\w+/i

export function parseKitchenNotes(raw?: string | null): ParsedKitchenNotes {
  if (!raw || !raw.trim()) return { callouts: [], meta: [], note: '' }
  const callouts: string[] = []
  const meta: string[] = []
  const note: string[] = []

  const classify = (segment: string) => {
    const s = segment.trim()
    if (!s) return
    if (CALLOUT_PATTERN.test(s)) callouts.push(s.replace(/^[\p{Emoji}\s]+/u, '').trim())
    else if (META_PATTERN.test(s)) meta.push(s)
    else note.push(s)
  }

  // Bracketed tags first, then the bullet-separated remainder.
  const rest = raw.replace(/\[([^\]]*)\]/g, (_m, inner: string) => {
    classify(inner)
    return ' • '
  })
  rest.split('•').forEach(classify)

  // "[TILL]" duplicates the source badge every card already shows.
  const quietMeta = meta.filter((m) => !/^(TILL|PHONE|STAFF|WEBSITE|COUNTER)( ORDER)?$/i.test(m.trim()))
  return { callouts: [...new Set(callouts)], meta: [...new Set(quietMeta)], note: note.join(' • ') }
}
