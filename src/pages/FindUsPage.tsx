import PageHeader from '../components/PageHeader'
import FindUs from '../components/FindUs'
import Values from '../components/Values'
import FAQSection from '../components/FAQSection'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

export default function FindUsPage() {
  useDocumentMeta({
    title: 'Find Us — Market Square, Aylesbury HP20 1SN | Hours & Map',
    description:
      'Visit Just Spuds on historic Market Square in Aylesbury. Open daily 11:00–22:00. Hot counter pickup, seating, and town centre directions.',
  })
  return (
    <>
      <PageHeader ghost="HP20" eyebrow="Find us" title="Market" titleItalic="Square" />
      <FindUs embedded />
      <FAQSection />
      <Values />
    </>
  )
}

