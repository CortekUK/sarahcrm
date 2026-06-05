import { loadStripe, type Stripe } from '@stripe/stripe-js'

// Singleton browser Stripe instance for Elements (card capture on the
// membership-application form). loadStripe is called once and the
// promise reused across renders so the Stripe.js script isn't injected
// more than once. Test publishable key in dev; swap the env value for
// the live key in production — no code change needed.

let stripePromise: Promise<Stripe | null> | null = null

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!key) {
      // Surface a clear error in dev rather than a silent null that makes
      // the card field never mount.
      console.error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set')
      return Promise.resolve(null)
    }
    stripePromise = loadStripe(key)
  }
  return stripePromise
}
