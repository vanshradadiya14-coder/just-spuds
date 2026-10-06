import Builder from '../components/Builder'
import PageHeader from '../components/PageHeader'
import FulfillmentSwitcher from '../components/FulfillmentSwitcher'
import { useCart } from '../hooks/useCart'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

export default function BuildPage() {
  const { fulfilment } = useCart()

  useDocumentMeta({
    title: 'Craft Your Own Spud — Build Your Fresh Baked Potato',
    description:
      'Customise your hot oven-baked potato with fresh fillings, grated mature cheddar, baked beans, crispy bacon, and artisan dressings.',
  })

  return (
    <>
      <PageHeader
        ghost="CRAFT"
        eyebrow={fulfilment === 'delivery' ? '🛵 Home Delivery Active' : '🛍️ Store Pick Up Active'}
        title="Craft Your Spud"
        titleItalic="topped your way"
        blurb="Design your steaming King Edward jacket potato or bowl with your favourite fillings, melted British cheeses, and house dressings."
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
