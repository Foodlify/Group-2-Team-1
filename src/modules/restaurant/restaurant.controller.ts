import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { restaurantService } from "./restaurant.service";
import type {
  CreateRestaurantInput,
  RestaurantIdParams,
  RestaurantQuery,
  UpdateRestaurantInput,
} from "./restaurant.validation";

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
    const restaurant = await restaurantService.getByIdOrThrow(
      req.params.restaurantId,
    );
    sendSuccess(res, restaurant, "Restaurant retrieved");
  },
);

export const getRestaurantMenus = asyncHandler(
  async (req: Request<RestaurantIdParams>, res: Response): Promise<void> => {
    const menus = await restaurantService.getMenus(req.params.restaurantId);
    sendSuccess(res, menus, "Menus retrieved");
  },
);

// ─── Admin management (ADMIN only) ───────────────────────
export const createRestaurant = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const restaurant = await restaurantService.create(
      req.body as CreateRestaurantInput,
    );
    sendSuccess(res, restaurant, "Restaurant created", 201);
  },
);

export const updateRestaurant = asyncHandler(
  async (req: Request<RestaurantIdParams>, res: Response): Promise<void> => {
    const restaurant = await restaurantService.update(
      req.params.restaurantId,
      req.body as UpdateRestaurantInput,
    );
    sendSuccess(res, restaurant, "Restaurant updated");
  },
);

export const deleteRestaurant = asyncHandler(
  async (req: Request<RestaurantIdParams>, res: Response): Promise<void> => {
    await restaurantService.remove(req.params.restaurantId);
    sendSuccess(res, null, "Restaurant deleted");
  },
);
