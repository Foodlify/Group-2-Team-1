import Stripe from "stripe";
import env from "../../config/env";

let client: Stripe | null = null;

export const isStripeConfigured = (): boolean =>
  Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

export const getStripe = (): Stripe => {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    maxNetworkRetries: 2,
  });
  return client;
};

export const resetStripeClient = (): void => {
  client = null;
};
