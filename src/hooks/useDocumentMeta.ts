import { useEffect } from 'react'

interface DocumentMetaProps {
  title?: string
  description?: string
  canonicalUrl?: string
}

export function useDocumentMeta({
  title,
  description,
  canonicalUrl,
}: DocumentMetaProps) {
  useEffect(() => {
    // 1. Document Title
    const baseTitle = 'Just Spuds (JustSpuds) | Fresh British Jacket Potatoes, Aylesbury'
    document.title = title ? `${title} | Just Spuds (JustSpuds) Aylesbury` : baseTitle

    // 2. Meta Description
    const defaultDescription =
      'Just Spuds (JustSpuds) Aylesbury — Hot British jacket potatoes with King Edward spuds, gourmet fillings, baguettes, and paninis baked fresh daily in Market Square, Aylesbury. Order online for pickup or delivery.'
    const metaDesc = document.querySelector('meta[name="description"]')
    if (metaDesc) {
      metaDesc.setAttribute('content', description || defaultDescription)
    }

    // 3. OpenGraph Title & Description
    const ogTitle = document.querySelector('meta[property="og:title"]')
    if (ogTitle) {
      ogTitle.setAttribute('content', title ? `${title} | Just Spuds` : baseTitle)
    }

    const ogDesc = document.querySelector('meta[property="og:description"]')
    if (ogDesc) {
      ogDesc.setAttribute('content', description || defaultDescription)
    }

    // 4. Canonical URL
    if (canonicalUrl) {
      let linkCanonical = document.querySelector('link[rel="canonical"]')
      if (!linkCanonical) {
        linkCanonical = document.createElement('link')
        linkCanonical.setAttribute('rel', 'canonical')
        document.head.appendChild(linkCanonical)
      }
      linkCanonical.setAttribute('href', canonicalUrl)
    }
  }, [title, description, canonicalUrl])
}
