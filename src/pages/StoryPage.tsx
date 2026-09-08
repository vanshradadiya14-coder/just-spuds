import PageHeader from '../components/PageHeader'
import Story from '../components/Story'
import Offer from '../components/Offer'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

export default function StoryPage() {
  useDocumentMeta({
    title: 'Our Heritage — British Street Food Tradition & Fresh Baking',
    description:
      'Discover the heritage of the British jacket potato from Victorian street vendors to our modern kitchen in Aylesbury Market Square.',
  })
  return (
    <>
      <PageHeader
        ghost="SPUDS"
        eyebrow="The Heritage of the Spud"
        title="Britain's Original"
        titleItalic="Street Food"
        blurb="The humble jacket potato has nourished British workers and families for generations — from steaming Victorian street cans to fresh daily baking on Aylesbury Market Square."
      />
      <Story embedded />
      <Offer />
    </>
  )
}
