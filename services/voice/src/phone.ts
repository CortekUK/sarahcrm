// Phone normalisation — same rules as src/lib/whatsapp/client.ts
// normalizeE164 and the SQL public.voice_phone_digits() in
// supabase/migrations/20261028_voice_calls.sql (keep the three in sync):
//   1. strip everything but digits (remember a leading '+');
//   2. leading '+'  → already international;
//   3. leading '00' → international access prefix, drop it;
//   4. leading '0'  → UK national trunk, drop it and prepend 44;
//   5. otherwise    → bare digits, kept as-is if they already carry 44 or are
//                     long enough to carry their own country code, else 44 is
//                     prepended.
// Returns '+<digits>' or null when fewer than 8 digits remain.

export function normaliseE164(raw: string | null | undefined, defaultCountryCode = '44'): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed || /^(anonymous|restricted|unknown|private)$/i.test(trimmed)) return null
  const hadPlus = trimmed.startsWith('+')
  let digits = trimmed.replace(/\D+/g, '')
  if (!digits) return null
  if (hadPlus) {
    // full international number
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2)
  } else if (digits.startsWith('0')) {
    digits = defaultCountryCode + digits.slice(1)
  } else if (digits.startsWith(defaultCountryCode) || digits.length >= 11) {
    // already carries a country code
  } else {
    digits = defaultCountryCode + digits
  }
  if (digits.length < 8 || digits.length > 15) return null
  return `+${digits}`
}

/** Digits only, no '+': the form public.voice_phone_digits() compares on. */
export function phoneDigits(raw: string | null | undefined): string | null {
  const e = normaliseE164(raw)
  return e ? e.slice(1) : null
}

/** "+447915919880" → "07915 919880" for speaking back to a UK caller. */
export function speakablePhone(e164: string | null | undefined): string | null {
  if (!e164) return null
  if (e164.startsWith('+44') && e164.length === 13) {
    const national = `0${e164.slice(3)}`
    return `${national.slice(0, 5)} ${national.slice(5)}`
  }
  return e164
}
