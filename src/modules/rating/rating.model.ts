import type { RestaurantRateModel } from "../../generated/prisma/models";

export type RestaurantRateWithCustomer = RestaurantRateModel & {
  customer?: { user: { name: string } };
};
