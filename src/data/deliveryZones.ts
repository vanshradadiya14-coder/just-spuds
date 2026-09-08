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
}

/**
 * Normalizes and checks a UK postcode against our delivery zones
 */
export function validateDeliveryPostcode(rawPostcode: string): PostcodeValidationResult {
  if (!rawPostcode || !rawPostcode.trim()) {
    return {
      valid: false,
      formatted: '',
      zone: null,
      message: 'Please enter your Aylesbury postcode (e.g. HP20 1SN)',
      canDeliver: false,
    }
  }

  // Normalize: uppercase and remove extraneous whitespace
  const clean = rawPostcode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  
  if (clean.length < 3) {
    return {
      valid: false,
      formatted: clean,
      zone: null,
      message: 'Postcode is too short',
      canDeliver: false,
    }
  }

  // Extract outward code prefix (e.g. "HP20" from "HP201SN" or "HP20")
  let outward = clean
  if (clean.length > 4 && (clean.endsWith('SN') || clean.endsWith('EQ') || clean.endsWith('AA') || clean.length >= 6)) {
    outward = clean.slice(0, clean.length - 3)
  }

  // Check matching zone
  for (const zone of DELIVERY_ZONES) {
    if (zone.prefixes.some((p) => clean.startsWith(p) || outward === p)) {
      // Format with a space: "HP20 1SN"
      const formatted = clean.length > 4
        ? `${clean.slice(0, clean.length - 3)} ${clean.slice(clean.length - 3)}`
        : clean

      return {
        valid: true,
        formatted,
        zone,
        message: `✓ Delivery available in ${zone.name} (${zone.description})`,
        canDeliver: true,
      }
    }
  }

  return {
    valid: false,
    formatted: clean,
    zone: null,
    message: `Sorry, we only deliver to Aylesbury postcodes (HP17-HP22). Store Pick Up at Market Square is available!`,
    canDeliver: false,
  }
}
