import { motion } from 'framer-motion'
import SmartImage from './SmartImage'
import { useReducedMotion } from '../hooks/useReducedMotion'

/**
 * Photography wipes open rather than fading. The image itself counter-scales
 * so the subject stays still while the mask travels — the detail that makes it
 * read as intentional rather than as a generic fade-in.
 */
export default function RevealImage({
  src, alt, className, imgClassName, fallbackLabel, cover = true, delay = 0, eager = false,
}: {
  src: string
  alt: string
  className?: string
  imgClassName?: string
  fallbackLabel?: string
  cover?: boolean
  delay?: number
  eager?: boolean
}) {
  const reduced = useReducedMotion()

  if (reduced) {
    return (
      <div className={className}>
        <SmartImage src={src} alt={alt} fallbackLabel={fallbackLabel} className="h-full w-full" imgClassName={imgClassName} cover={cover} eager={eager} />
      </div>
    )
  }

  return (
    <motion.div
      className={`overflow-hidden will-change-transform ${className ?? ''}`}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.75, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <SmartImage
        src={src}
        alt={alt}
        fallbackLabel={fallbackLabel}
        className="h-full w-full"
        imgClassName={imgClassName}
        cover={cover}
        eager={eager}
      />
    </motion.div>
  )
}
