import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { menuItemService } from "./menuItem.service";
import type { MenuItemIdParams } from "./menuItem.validation";

export const getMenuItem = asyncHandler(
  async (req: Request<MenuItemIdParams>, res: Response): Promise<void> => {
    const item = await menuItemService.getByIdOrThrow(req.params.menuItemId);
    sendSuccess(res, item, "Menu item retrieved");
  },
);
