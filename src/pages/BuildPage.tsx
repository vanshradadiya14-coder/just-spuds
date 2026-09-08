import Builder from '../components/Builder'
import PageHeader from '../components/PageHeader'
import FulfillmentSwitcher from '../components/FulfillmentSwitcher'
import { useCart } from '../hooks/useCart'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

export default function BuildPage() {
  const { fulfilment } = useCart()

  useDocumentMeta({
    title: 'Custom Spud Lab — Build Your Own Jacket Potato',
    description:
      'Customise your hot baked potato with fresh fillings, grated cheddar, baked beans, crispy bacon, and gourmet sauces with live calorie calculation.',
  })

  return (
    <>
      <PageHeader
        ghost="LAB"
        eyebrow={fulfilment === 'delivery' ? '🛵 Home Delivery Active' : '🛍️ Store Pick Up Active'}
        title="Custom Spud Lab"
        titleItalic="topped your way"
        blurb="Design your hot jacket potato or bowl with unlimited fillings, cheeses, and sauces with real-time calorie and protein tracking."
      />
      <div className="bg-paper pb-5 pt-3 border-b border-ink/8">
        <div className="mx-auto max-w-3xl px-4">
          <FulfillmentSwitcher />
        </div>
      </div>
      <Builder embedded />
    </>
  )
}
