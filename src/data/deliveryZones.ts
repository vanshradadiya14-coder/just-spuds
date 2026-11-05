/**
 * AYLESBURY DELIVERY ZONES & POSTCODE VALIDATION
 * -----------------------------------------------
 * Governs delivery radiuses, minimum order thresholds, zone fees, and ETAs.
 */

export interface DeliveryZone {
  id: string
  name: string
  prefixes: string[] // Outward codes
  feePence: number
  freeThresholdPence: number
  minOrderPence: number
  etaMins: number
  description: string
}

export const DELIVERY_ZONES: DeliveryZone[] = [
  {
    id: 'zone-1-central',
    name: 'Zone 1: Core Aylesbury',
    prefixes: ['HP19', 'HP20', 'HP21'],
    feePence: 200, // £2.00
    freeThresholdPence: 1500, // Free over £15
    minOrderPence: 1000, // Min £10.00
    etaMins: 30,
    description: 'Central Aylesbury, Elmhurst, Gatehouse, Bedgrove, Walton Court',
  },
  {
    id: 'zone-2-outer',
    name: 'Zone 2: Greater Aylesbury & Villages',
    prefixes: ['HP17', 'HP18', 'HP22'],
    feePence: 350, // £3.50
    freeThresholdPence: 2500, // Free over £25
    minOrderPence: 1500, // Min £15.00
    etaMins: 45,
    description: 'Fairford Leys, Bierton, Weston Turville, Stone, Waddesdon, Haddenham',
  },
]

export interface PostcodeValidationResult {
  valid: boolean
  formatted: string
  zone: DeliveryZone | null
  message: string
  canDeliver: boolean
  /** True when the postcode is empty, partial (only outward prefix), or malformed. */
  isIncomplete?: boolean
  /** True when the postcode is a real UK postcode format, but outside HP17–HP22. */
  isOutsideArea?: boolean
}

/**
 * Standard Royal Mail UK postcode pattern:
 * Outward code (2–4 chars, starts with 1–2 letters) + Inward code (1 digit + 2 letters, excluding CIKMOV).
 * We also allow standard A-Z in the inward code so legitimate edge cases are caught by live lookup.
 */
const FULL_UK_POSTCODE_REGEX = /^([A-Z]{1,2}[0-9][0-9A-Z]?)\s*([0-9][A-Z]{2})$/i
const OUTWARD_ONLY_REGEX = /^[A-Z]{1,2}[0-9][0-9A-Z]?$/i

/**
 * Normalizes and checks a full UK postcode against our Aylesbury delivery zones.
 * Rejects partial postcodes (e.g. "HP20" without inward code) and fake inward codes (e.g. "HP20 123").
 */
export function validateDeliveryPostcode(rawPostcode: string): PostcodeValidationResult {
  if (!rawPostcode || !rawPostcode.trim()) {
    return {
      valid: false,
      formatted: '',
      zone: null,
      message: 'Please enter your full Aylesbury postcode (e.g. HP19 8EQ)',
      canDeliver: false,
      isIncomplete: true,
    }
  }

  // Normalize: uppercase and remove extraneous non-alphanumeric characters
  const clean = rawPostcode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')

  if (clean.length < 5) {
    // Check if they typed a valid Aylesbury outward prefix so far (e.g. "HP20")
    const matchingZone = DELIVERY_ZONES.find((z) => z.prefixes.some((p) => clean === p || p.startsWith(clean)))
    if (matchingZone && OUTWARD_ONLY_REGEX.test(clean)) {
      return {
        valid: false,
        formatted: clean,
        zone: matchingZone,
        message: `Almost there — please enter the last 3 characters of your ${clean} postcode (e.g. ${clean} 1SN).`,
        canDeliver: false,
        isIncomplete: true,
      }
    }
    return {
      valid: false,
      formatted: clean,
      zone: null,
      message: 'Please enter your full UK postcode (e.g. HP19 8EQ).',
      canDeliver: false,
      isIncomplete: true,
    }
  }

  const match = clean.match(FULL_UK_POSTCODE_REGEX)
  if (!match) {
    return {
      valid: false,
      formatted: clean,
      zone: null,
      message: 'Invalid UK postcode format — must end with 1 number and 2 letters (e.g. HP19 8EQ).',
      canDeliver: false,
      isIncomplete: true,
    }
  }

  const outward = match[1].toUpperCase()
  const inward = match[2].toUpperCase()
  const formatted = `${outward} ${inward}`

  // Reject Royal Mail forbidden inward letters (C, I, K, M, O, V are never used in the final two letters of UK postcodes)
  if (/[CIKMOV]/.test(inward.slice(1))) {
    return {
      valid: false,
      formatted,
      zone: null,
      message: `"${formatted}" is not a valid Royal Mail postcode (letters C, I, K, M, O, V are never used at the end of a UK postcode).`,
      canDeliver: false,
      isIncomplete: true,
    }
  }

  // Check matching Aylesbury zone
  for (const zone of DELIVERY_ZONES) {
    if (zone.prefixes.includes(outward)) {
      return {
        valid: true,
        formatted,
        zone,
        message: `✓ Delivery available in ${zone.name} (${zone.description})`,
        canDeliver: true,
        isIncomplete: false,
        isOutsideArea: false,
      }
    }
  }

  return {
    valid: false,
    formatted,
    zone: null,
    message: `Sorry, we only deliver to Aylesbury postcodes (HP17–HP22). Store Pick Up at Market Square is available!`,
    canDeliver: false,
    isIncomplete: false,
    isOutsideArea: true,
  }
}
