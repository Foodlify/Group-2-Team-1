import type { RestaurantRateModel } from "../../generated/prisma/models";

/**
 * A rate row optionally joined with the rater's display name — the public
 * restaurant listing includes it, the customer's own listing does not.
 */
export type RestaurantRateWithCustomer = RestaurantRateModel & {
  customer?: { user: { name: string } };
};
