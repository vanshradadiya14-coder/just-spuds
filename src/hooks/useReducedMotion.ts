import { useMediaQuery } from './useMediaQuery'

/** True when the user has asked the OS to minimise animation. */
export const useReducedMotion = () =>
  useMediaQuery('(prefers-reduced-motion: reduce)')
