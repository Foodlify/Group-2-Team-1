import Stripe from "stripe";
import env from "../../config/env";

/**
 * The Stripe SDK client, created once and only when a secret key is actually
 * configured.
 *
 * `new Stripe(undefined!)` throws at construction, so this must not run at
 * import time in an environment without the key — which is every test run and
 * any deployment that hasn't enabled card payments. Callers reach it through
 * `getStripe()`, and `isStripeConfigured()` is what decides whether the card
 * strategy is registered at all.
 */
let client: Stripe | null = null;

export const isStripeConfigured = (): boolean =>
  Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

export const getStripe = (): Stripe => {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  // The API version is not set here on purpose: this SDK's types accept only
  // the version it was generated against, and it sends that version by default.
  // Upgrading the API therefore means upgrading the `stripe` package, which is
  // exactly the coupling we want — a date string in our code could drift away
  // from the types that validate our calls.
  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    // Stripe's own retry of idempotent requests — cheap insurance against a
    // transient network blip turning into a failed checkout.
    maxNetworkRetries: 2,
  });
  return client;
};

/** Test seam: forces the next `getStripe()` to build a fresh client. */
export const resetStripeClient = (): void => {
  client = null;
};
