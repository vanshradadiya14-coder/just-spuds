import type { ReceiptBlock } from '../services/receiptDoc'

/**
 * A slip drawn at its real paper width (72 mm on an 80 mm roll, 48 mm on
 * 58 mm) — the printable area, not the roll, so nothing is cut off at the edge.
 * Sizes are in points so the paper copy is the same size on every printer.
 */
export default function ReceiptPaper({ blocks, widthMm = 72 }: { blocks: ReceiptBlock[]; widthMm?: number }) {
  const narrow = widthMm < 60
  return (
    <div
      className="receipt-paper bg-white text-black"
      style={{
        width: `${widthMm}mm`,
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: narrow ? '7.5pt' : '9pt',
        lineHeight: 1.3,
        padding: '1mm 0',
        color: '#000',
      }}
    >
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'title':
            return (
              <p key={i} style={{ textAlign: 'center', fontWeight: 900, fontSize: narrow ? '12pt' : '15pt', lineHeight: 1.1, margin: '0 0 1mm', letterSpacing: '0.02em' }}>
                {b.text}
              </p>
            )
          case 'big':
            return (
              <p key={i} style={{ textAlign: 'center', fontWeight: 900, fontSize: narrow ? '10.5pt' : '13pt', margin: '1mm 0' }}>
                {b.text}
              </p>
            )
          case 'center':
            return (
              <p key={i} style={{ textAlign: 'center', fontWeight: b.bold ? 700 : 400, margin: 0 }}>
                {b.text}
              </p>
            )
          case 'text':
            return (
              <p key={i} style={{ fontWeight: b.bold ? 700 : 400, paddingLeft: `${(b.indent || 0) * 0.5}em`, margin: 0, overflowWrap: 'anywhere' }}>
                {b.text}
              </p>
            )
          case 'row':
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: '2mm',
                  paddingLeft: `${(b.indent || 0) * 0.5}em`,
                  fontWeight: b.bold ? 700 : 400,
                  fontSize: b.big ? (narrow ? '10.5pt' : '13pt') : undefined,
                }}
              >
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{b.left}</span>
                {b.right && <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{b.right}</span>}
              </div>
            )
          case 'inverse':
            // A heavy box rather than white-on-black: browsers drop backgrounds
            // when "background graphics" is off, which would print nothing.
            return (
              <p key={i} style={{ textAlign: 'center', fontWeight: 900, border: '0.6mm solid #000', padding: '0.6mm 1mm', margin: '1mm 0' }}>
                {b.text}
              </p>
            )
          case 'rule':
            return <div key={i} style={{ borderTop: b.heavy ? '0.5mm solid #000' : '0.25mm dashed #000', margin: '1.2mm 0' }} />
          case 'gap':
            return <div key={i} style={{ height: '1.5mm' }} />
          default:
            return null
        }
      })}
    </div>
  )
}
