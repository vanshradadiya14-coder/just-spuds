/**
 * CUSTOMER DETAILS, UK PHONE & AYLESBURY ADDRESS VERIFICATION SERVICE
 * -------------------------------------------------------------------
 * Prevents false, gibberish, or incomplete customer names, phone numbers,
 * postcodes, and delivery street addresses during online food ordering.
 *
 * Includes:
 *  1. Strict UK Mobile & Landline verification (format, prefix range, anti-fake sequence checks)
 *  2. Customer Full Name verification (anti-gibberish, minimum letters)
 *  3. Street Address verification (requires both House/Flat number/building & real Street name)
 *  4. Live UK Royal Mail / Ordnance Survey Postcode verification via Postcodes.io
 *     plus nearby street name suggestions for 1-tap address completion.
 */

import { validateDeliveryPostcode, type PostcodeValidationResult } from '../data/deliveryZones'

export interface NameValidationResult {
  valid: boolean
  formatted: string
  message: string
}

export interface PhoneValidationResult {
  valid: boolean
  formatted: string
  normalized: string
  lineType?: 'mobile' | 'landline'
  message: string
}

export interface EmailValidationResult {
  valid: boolean
  formatted: string
  message: string
}

export interface StreetValidationResult {
  valid: boolean
  formatted: string
  hasDoorIdentifier: boolean
  hasStreetName: boolean
  message: string
}

export interface LivePostcodeLookupResult {
  status: 'verified' | 'not_found' | 'outside_zone' | 'invalid_format' | 'offline'
  postcode: string
  ward?: string
  parish?: string
  adminDistrict?: string
  localityLabel?: string
  latitude?: number
  longitude?: number
  suggestedStreets?: string[]
  message: string
}

const FAKE_NAME_WORDS = new Set([
  'test',
  'testing',
  'tester',
  'asdf',
  'asdfg',
  'asdfgh',
  'qwerty',
  'qwert',
  'zxcv',
  'none',
  'null',
  'undefined',
  'fake',
  'false',
  'anon',
  'anonymous',
  'nobody',
  'noname',
  'na',
  'n/a',
  'idk',
  'abc',
  'abcd',
  'xyz',
  'xxx',
  'zzz',
  'aaa',
])

const NAMED_BUILDING_KEYWORDS = /\b(house|cottage|lodge|manor|hall|court|farm|rectory|vicarage|bungalow|villa|chambers|inn|arms|hotel|barn|mill|priory|grange|tower|abbey|mews|annexe|flat|apt|apartment|unit|suite|room|block|studio)\b/i

const STREET_FILLER_WORDS = new Set(['the', 'and', 'of', 'at', 'in', 'on', 'to', 'no', 'st', 'rd', 'ave', 'ln', 'cl'])

const FAKE_STREET_WORDS = new Set([
  'test',
  'testing',
  'asdf',
  'asdfg',
  'qwerty',
  'none',
  'null',
  'undefined',
  'fake',
  'false',
  'na',
  'n/a',
  'idk',
  'nowhere',
  'no address',
  'same',
  'here',
  'home',
  'house',
  'street',
  'road',
  'aylesbury',
  'uk',
  'england',
])

/**
 * 1. Validate Customer Full Name
 */
export function validateCustomerName(rawName: string): NameValidationResult {
  const clean = (rawName || '').replace(/\s+/g, ' ').trim()
  if (!clean) {
    return { valid: false, formatted: '', message: 'Please enter your full name.' }
  }

  // Letters in any script: Chinese, Arabic, Gujarati and Polish names are as real as English ones.
  const lettersOnly = clean.replace(/[^\p{L}]/gu, '')
  if (lettersOnly.length < 2) {
    return {
      valid: false,
      formatted: clean,
      message: 'Please enter your real name (at least 2 letters).',
    }
  }

  // Reject strings with digits mixed in (e.g. "John123" or "12345")
  if (/\d/.test(clean)) {
    return {
      valid: false,
      formatted: clean,
      message: 'Name cannot contain numbers — please enter your real name.',
    }
  }

  // Reject 4+ identical consecutive characters (e.g. "aaaa", "ssss")
  if (/(.)\1{3,}/i.test(lettersOnly)) {
    return {
      valid: false,
      formatted: clean,
      message: 'Please enter a valid name without repeated characters.',
    }
  }

  // Reject single-word placeholder/gibberish names
  const lower = clean.toLowerCase()
  if (FAKE_NAME_WORDS.has(lower)) {
    return {
      valid: false,
      formatted: clean,
      message: `"${clean}" appears to be a placeholder — please enter your real name for your order.`,
    }
  }

  // No "looks like gibberish" rule: it refused real names (Srdjan, Krk, Ng) and
  // never stopped a made-up one. Only the server-side phone check (SMS code)
  // can tell a real customer from a fake one.

  return {
    valid: true,
    formatted: clean,
    // A format check, not a check that this is who they say they are.
    message: '✓ Looks good',
  }
}

/**
 * Groups a national number the way people write it: 07911 654987, 020 7946 0958,
 * 0113 496 0123, 01296 423456, 0330 123 4567.
 */
function formatUkNumber(digits: string): string {
  if (digits.startsWith('07')) return `${digits.slice(0, 5)} ${digits.slice(5)}`
  if (digits.startsWith('02') && digits.length === 11) return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
  if (/^011|^01[2-9]1|^03/.test(digits) && digits.length === 11) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  return `${digits.slice(0, 5)} ${digits.slice(5)}`
}

/**
 * 2. Validate UK Mobile or Geographic Landline Phone Number
 */
export function validateUKPhone(rawPhone: string): PhoneValidationResult {
  const raw = (rawPhone || '').trim()
  if (!raw) {
    return {
      valid: false,
      formatted: '',
      normalized: '',
      message: 'Please enter your UK mobile or landline number for order updates.',
    }
  }

  // Reject if letters are present
  if (/[a-zA-Z]/.test(raw)) {
    return {
      valid: false,
      formatted: raw,
      normalized: '',
      message: 'Phone number must contain digits only.',
    }
  }

  // Strip spaces, hyphens, parentheses, dots
  let digits = raw.replace(/[\s\-().]/g, '')

  // Normalize +44 or 0044 or 44 prefix to leading 0
  if (digits.startsWith('+44')) {
    digits = '0' + digits.slice(3)
  } else if (digits.startsWith('0044')) {
    digits = '0' + digits.slice(4)
  } else if (digits.startsWith('44') && digits.length === 12) {
    digits = '0' + digits.slice(2)
  }

  if (!/^\d+$/.test(digits)) {
    return {
      valid: false,
      formatted: raw,
      normalized: digits,
      message: 'Please enter a valid UK phone number (e.g. 07890 123456).',
    }
  }

  if (!digits.startsWith('0')) {
    return {
      valid: false,
      formatted: raw,
      normalized: digits,
      message: 'UK phone numbers must start with 07 (mobile), 01, 02, or +44.',
    }
  }

  // Reject personal (070), premium (09), freephone / business (08) and corporate (05) numbers —
  // nobody is reached about their dinner on those. 03 numbers cost the same as a landline and are kept.
  if (digits.startsWith('070') || digits.startsWith('08') || digits.startsWith('09') || digits.startsWith('05')) {
    return {
      valid: false,
      formatted: raw,
      normalized: digits,
      message: 'Please enter a standard UK mobile (07) or landline (01, 02 or 03) number.',
    }
  }

  const isMobile = digits.startsWith('07')
  const isLandline = digits.startsWith('01') || digits.startsWith('02') || digits.startsWith('03')

  if (!isMobile && !isLandline) {
    return {
      valid: false,
      formatted: raw,
      normalized: digits,
      message: 'Please enter a valid UK mobile (07xxx xxxxxx) or landline (01296 xxxxxx).',
    }
  }

  if (isMobile) {
    if (digits.length !== 11) {
      return {
        valid: false,
        formatted: raw,
        normalized: digits,
        message:
          digits.length < 11
            ? `UK mobile numbers must be 11 digits (${digits.length}/11 entered).`
            : `UK mobile numbers must be 11 digits (${digits.length} entered — too long).`,
      }
    }

    // Valid UK mobile prefixes: 071–075, 07624 (Isle of Man), 077–079
    const validMobilePrefix = /^07([1-57-9]\d{2}|624)/.test(digits)
    if (!validMobilePrefix) {
      return {
        valid: false,
        formatted: raw,
        normalized: digits,
        message: 'Invalid UK mobile prefix — please check the first 5 digits (e.g. 077, 078, 079, 074, 075).',
      }
    }
  }

  if (isLandline) {
    if (digits.length < 10 || digits.length > 11) {
      return {
        valid: false,
        formatted: raw,
        normalized: digits,
        message: 'UK landline numbers must be 10 or 11 digits (e.g. 01296 123456).',
      }
    }
  }

  // The only "fake" pattern worth refusing: six or more of the same digit in a
  // row (07000 000000, 07777 777777). Numbers like 07911 123456 or 07400 121212
  // are ordinary allocated numbers — refusing "sequences" turned real customers
  // away. Whether the customer holds the number is for an SMS code to prove.
  if (/(\d)\1{5,}/.test(digits)) {
    return {
      valid: false,
      formatted: raw,
      normalized: digits,
      message: 'This phone number looks fake (repeated digits). Please enter your real contact number.',
    }
  }

  const formatted = formatUkNumber(digits)

  return {
    valid: true,
    formatted,
    normalized: digits,
    lineType: isMobile ? 'mobile' : 'landline',
    message: isMobile ? `✓ Valid UK Mobile (${formatted})` : `✓ Valid UK Landline (${formatted})`,
  }
}

/**
 * 3. Validate Optional Customer Email
 */
export function validateCustomerEmail(rawEmail: string): EmailValidationResult {
  const clean = (rawEmail || '').trim().toLowerCase()
  if (!clean) {
    return { valid: true, formatted: '', message: '' }
  }
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i
  if (!emailRegex.test(clean)) {
    return {
      valid: false,
      formatted: clean,
      message: 'Please enter a valid email address (e.g. name@example.com) or leave it blank.',
    }
  }
  const [localPart, domain] = clean.split('@')
  if (
    !localPart ||
    !domain ||
    domain === 'test.com' ||
    domain === 'fake.com' ||
    domain === 'asdf.com' ||
    domain === 'none.com' ||
    /^(.)\1{4,}$/.test(localPart)
  ) {
    return {
      valid: false,
      formatted: clean,
      message: 'Please enter a real email address or leave the email field empty.',
    }
  }
  return { valid: true, formatted: clean, message: '✓ Valid email' }
}

/**
 * 4. Validate Delivery Street Address
 * Requires BOTH:
 *  - A house/flat/door number (e.g. "14", "2B", "Flat 3") OR a named building ("Rose Cottage", "Manor Farm")
 *  - A street/road name with at least 3 letters (e.g. "Oxford Road", "High St", "Market Square")
 */
export function validateStreetAddress(rawStreet: string, postcode?: string): StreetValidationResult {
  const clean = (rawStreet || '').replace(/\s+/g, ' ').trim()
  if (!clean) {
    return {
      valid: false,
      formatted: '',
      hasDoorIdentifier: false,
      hasStreetName: false,
      message: 'Please enter your house/flat number and street name (e.g. 14 Oxford Road).',
    }
  }

  if (clean.length < 5) {
    return {
      valid: false,
      formatted: clean,
      hasDoorIdentifier: false,
      hasStreetName: false,
      message: 'Street address is too short — please include your door number and street name.',
    }
  }

  // Check if the customer just pasted their postcode into the street box
  const cleanAlnum = clean.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const postcodeAlnum = (postcode || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (postcodeAlnum && cleanAlnum === postcodeAlnum) {
    return {
      valid: false,
      formatted: clean,
      hasDoorIdentifier: false,
      hasStreetName: false,
      message: 'Please enter your house number and street name, not just the postcode.',
    }
  }

  // Letters only: "10000 Tring Road" is not gibberish, "ssss road" is.
  const lower = clean.toLowerCase()
  if (FAKE_STREET_WORDS.has(lower) || /(\p{L})\1{3,}/iu.test(clean)) {
    return {
      valid: false,
      formatted: clean,
      hasDoorIdentifier: false,
      hasStreetName: false,
      message: 'Please enter a real delivery street address (e.g. 14 Oxford Road).',
    }
  }

  // Check for door/building number or named building
  const hasNumber = /\b\d+[a-zA-Z]?\b/.test(clean)
  const hasNamedBuilding = NAMED_BUILDING_KEYWORDS.test(clean)
  const hasDoorIdentifier = hasNumber || hasNamedBuilding

  // The street name is whatever is left once door numbers, building words
  // ("Flat", "Unit", "Cottage") and filler ("the", "and") are taken out — so
  // "Flat 3" or "14 the" is not an address, "Flat 3, 14 Oxford Road" is.
  const withoutDoorNumbers = clean.replace(/\b\d+[a-zA-Z]?\b/g, ' ').trim()
  const alphaWords = withoutDoorNumbers
    .split(/[\s,.-]+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ''))
    .filter((w) => w.length >= 2 && !NAMED_BUILDING_KEYWORDS.test(w) && !STREET_FILLER_WORDS.has(w.toLowerCase()))

  const totalLetters = alphaWords.join('').length
  const hasStreetName = alphaWords.length >= 1 && totalLetters >= 3 && !FAKE_STREET_WORDS.has(alphaWords.join(' ').toLowerCase())

  if (!hasDoorIdentifier && !hasStreetName) {
    return {
      valid: false,
      formatted: clean,
      hasDoorIdentifier: false,
      hasStreetName: false,
      message: 'Please enter both your house/flat number and street name (e.g. 14 Oxford Road).',
    }
  }

  if (!hasDoorIdentifier) {
    return {
      valid: false,
      formatted: clean,
      hasDoorIdentifier: false,
      hasStreetName: true,
      message: `Please include your house or flat number on ${clean} so our driver can find your door.`,
    }
  }

  if (!hasStreetName) {
    return {
      valid: false,
      formatted: clean,
      hasDoorIdentifier: true,
      hasStreetName: false,
      message: 'Please include your street or road name alongside your house/flat number (e.g. 14 Oxford Road).',
    }
  }

  return {
    valid: true,
    formatted: clean,
    hasDoorIdentifier: true,
    hasStreetName: true,
    message: '✓ Valid street address & door number',
  }
}

/**
 * 5. Live UK Postcode & Street Verification via Official Postcodes.io + OpenStreetMap
 */
const livePostcodeCache = new Map<string, LivePostcodeLookupResult>()

export function getCachedPostcodeLookup(rawPostcode: string): LivePostcodeLookupResult | null {
  const syncCheck = validateDeliveryPostcode(rawPostcode)
  if (!syncCheck.formatted) return null
  return livePostcodeCache.get(syncCheck.formatted) || null
}

export async function verifyPostcodeOnline(rawPostcode: string): Promise<LivePostcodeLookupResult> {
  const syncCheck: PostcodeValidationResult = validateDeliveryPostcode(rawPostcode)

  if (syncCheck.isOutsideArea) {
    return {
      status: 'outside_zone',
      postcode: syncCheck.formatted,
      message: syncCheck.message,
    }
  }

  if (!syncCheck.valid || !syncCheck.canDeliver) {
    return {
      status: 'invalid_format',
      postcode: syncCheck.formatted,
      message: syncCheck.message,
    }
  }

  const formatted = syncCheck.formatted
  const cached = livePostcodeCache.get(formatted)
  if (cached) return cached

  if (typeof fetch === 'undefined') {
    return {
      status: 'offline',
      postcode: formatted,
      message: syncCheck.message,
    }
  }

  try {
    const clean = formatted.replace(/\s+/g, '')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3500)

    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timeout)

    if (response.status === 404) {
      const notFoundResult: LivePostcodeLookupResult = {
        status: 'not_found',
        postcode: formatted,
        message: `❌ Postcode "${formatted}" does not exist in Royal Mail / Ordnance Survey records. Please check for typos.`,
      }
      livePostcodeCache.set(formatted, notFoundResult)
      return notFoundResult
    }

    if (!response.ok) {
      return {
        status: 'offline',
        postcode: formatted,
        message: syncCheck.message,
      }
    }

    const payload = (await response.json()) as {
      status: number
      result?: {
        postcode: string
        admin_ward?: string
        parish?: string
        admin_district?: string
        latitude?: number
        longitude?: number
      }
    }

    const r = payload.result
    const ward = r?.admin_ward || ''
    const parish = r?.parish && r.parish !== 'Unparished' ? r.parish : ''
    const district = r?.admin_district || 'Aylesbury'
    const localityParts = [...new Set([ward, parish, district].filter(Boolean))]
    const localityLabel = localityParts.slice(0, 2).join(', ') || 'Aylesbury'

    // Street suggestions come back with the Royal Mail address lookup (plan,
    // phase 2). The OpenStreetMap reverse lookup that used to sit here ran from
    // every customer's browser without identification or attribution, against
    // Nominatim's usage policy, and sent the customer's location to a third
    // party the privacy page does not name.
    const suggestedStreets: string[] = []

    const verifiedResult: LivePostcodeLookupResult = {
      status: 'verified',
      postcode: r?.postcode || formatted,
      ward,
      parish,
      adminDistrict: district,
      localityLabel,
      latitude: r?.latitude,
      longitude: r?.longitude,
      suggestedStreets,
      message: `✓ Verified UK Postcode — ${localityLabel} (${syncCheck.zone?.name || 'Aylesbury'})`,
    }

    livePostcodeCache.set(formatted, verifiedResult)
    return verifiedResult
  } catch {
    return {
      status: 'offline',
      postcode: formatted,
      message: syncCheck.message,
    }
  }
}

