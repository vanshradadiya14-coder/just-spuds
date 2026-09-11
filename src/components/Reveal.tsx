import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'

const variants: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.9, delay: i * 0.075, ease: [0.16, 1, 0.3, 1] },
  }),
}

export default function Reveal({
  children, delay = 0, className, as = 'div',
}: {
  children: ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'li' | 'section' | 'figure'
}) {
  const reduced = useReducedMotion()
  const Tag = motion[as]
  if (reduced) return <Tag className={className}>{children}</Tag>
  return (
    <Tag
      className={className}
      custom={delay}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-70px' }}
    >
      {children}
    </Tag>
  )
}
