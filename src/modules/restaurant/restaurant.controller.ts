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

/**
 * The route uses `optionalAuthenticate`, so `req.user` is present only when a
 * token was sent. `includeDeleted` is granted from that — asking for it without
 * an admin token is not an error, it just doesn't apply.
 */
const wantsDeleted = (req: Request): boolean =>
  req.user?.role === "ADMIN" &&
  (req.query as { includeDeleted?: boolean }).includeDeleted === true;

export const listRestaurants = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await restaurantService.list(
      req.query as unknown as RestaurantQuery,
      wantsDeleted(req),
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
    const menus = await restaurantService.getMenus(
      req.params.restaurantId,
      wantsDeleted(req),
    );
    sendSuccess(res, menus, "Menus retrieved");
  },
);

// ─── Admin management (ADMIN only) ───────────────────────
export const createRestaurant = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const restaurant = await restaurantService.create(
      req.body as CreateRestaurantInput,
      req.user!.id,
    );
    sendSuccess(res, restaurant, "Restaurant created", 201);
  },
);

export const updateRestaurant = asyncHandler(
  async (req: Request<RestaurantIdParams>, res: Response): Promise<void> => {
    const restaurant = await restaurantService.update(
      req.params.restaurantId,
      req.body as UpdateRestaurantInput,
      req.user!.id,
    );
    sendSuccess(res, restaurant, "Restaurant updated");
  },
);

export const deleteRestaurant = asyncHandler(
  async (req: Request<RestaurantIdParams>, res: Response): Promise<void> => {
    await restaurantService.remove(req.params.restaurantId, req.user!.id);
    sendSuccess(res, null, "Restaurant deleted");
  },
);

export const restoreRestaurant = asyncHandler(
  async (req: Request<RestaurantIdParams>, res: Response): Promise<void> => {
    const restaurant = await restaurantService.restore(
      req.params.restaurantId,
      req.user!.id,
    );
    sendSuccess(res, restaurant, "Restaurant restored");
  },
);
