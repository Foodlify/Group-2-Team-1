import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { menuService } from "./menu.service";
import type { MenuIdParams } from "./menu.validation";

export const getMenu = asyncHandler(
  async (req: Request<MenuIdParams>, res: Response): Promise<void> => {
    const menu = await menuService.getByIdWithItems(req.params.menuId);
    sendSuccess(res, menu, "Menu retrieved");
  },
);

export const getMenuItems = asyncHandler(
  async (req: Request<MenuIdParams>, res: Response): Promise<void> => {
    const items = await menuService.listItems(req.params.menuId);
    sendSuccess(res, items, "Menu items retrieved");
  },
);
