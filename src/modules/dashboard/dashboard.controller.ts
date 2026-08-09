import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { dashboardService } from "./dashboard.service";
import type { ReportQuery, RestaurantIdParams } from "./dashboard.validation";

export const getOverview = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const overview = await dashboardService.getOverview();
    sendSuccess(res, overview, "Dashboard overview retrieved");
  },
);

export const getTransactionReport = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const report = await dashboardService.getTransactionReport(
      req.query as unknown as ReportQuery,
    );
    sendSuccess(res, report, "Transaction report retrieved");
  },
);

export const getRestaurantReport = asyncHandler(
  async (req: Request<RestaurantIdParams>, res: Response): Promise<void> => {
    const report = await dashboardService.getRestaurantReport(
      req.params.restaurantId,
      req.query as unknown as ReportQuery,
    );
    sendSuccess(res, report, "Restaurant report retrieved");
  },
);
