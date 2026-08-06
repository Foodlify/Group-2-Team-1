import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import type { PaginationQuery } from "../../shared/schemas/pagination.schema";
import type { RestaurantIdParams } from "../restaurant/restaurant.validation";
import { customerService } from "../customer/customer.service";
import { ratingService } from "./rating.service";

export const rateOrder = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    const rating = await ratingService.rateOrder(customerId, req.body);
    sendSuccess(res, rating, "Rating submitted", StatusCodes.CREATED);
  },
);

export const listMyRatings = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    const ratings = await ratingService.listMine(customerId);
    sendSuccess(res, ratings, "Ratings retrieved");
  },
);

export const listRestaurantRatings = asyncHandler(
  async (req: Request<RestaurantIdParams>, res: Response): Promise<void> => {
    const { summary, ratings, meta } = await ratingService.listForRestaurant(
      req.params.restaurantId,
      req.query as unknown as PaginationQuery,
    );
    sendSuccess(
      res,
      { summary, ratings },
      "Restaurant ratings retrieved",
      StatusCodes.OK,
      meta,
    );
  },
);
