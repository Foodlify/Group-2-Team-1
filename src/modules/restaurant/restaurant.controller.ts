import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { restaurantService } from "./restaurant.service";
import type { RestaurantIdParams, RestaurantQuery } from "./restaurant.validation";

export const listRestaurants = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await restaurantService.list(
      req.query as unknown as RestaurantQuery,
    );
    sendSuccess(res, result.data, "Restaurants retrieved", 200, result.meta);
  },
);

export const getRestaurant = asyncHandler(
  async (req: Request<RestaurantIdParams>, res: Response): Promise<void> => {
    const restaurant = await restaurantService.getByIdOrThrow(req.params.restaurantId);
    sendSuccess(res, restaurant, "Restaurant retrieved");
  },
);

export const getRestaurantMenus = asyncHandler(
  async (req: Request<RestaurantIdParams>, res: Response): Promise<void> => {
    const menus = await restaurantService.getMenus(req.params.restaurantId);
    sendSuccess(res, menus, "Menus retrieved");
  },
);
