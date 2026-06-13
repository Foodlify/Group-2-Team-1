import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { menuItemService } from "./menuItem.service";
import type {
  CreateMenuItemInput,
  MenuItemIdParams,
  UpdateMenuItemInput,
} from "./menuItem.validation";

export const getMenuItem = asyncHandler(
  async (req: Request<MenuItemIdParams>, res: Response): Promise<void> => {
    const item = await menuItemService.getByIdOrThrow(req.params.menuItemId);
    sendSuccess(res, item, "Menu item retrieved");
  },
);

// ─── Admin management (ADMIN only) ───────────────────────
export const createMenuItem = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const item = await menuItemService.create(req.body as CreateMenuItemInput);
    sendSuccess(res, item, "Menu item created", 201);
  },
);

export const updateMenuItem = asyncHandler(
  async (req: Request<MenuItemIdParams>, res: Response): Promise<void> => {
    const item = await menuItemService.update(
      req.params.menuItemId,
      req.body as UpdateMenuItemInput,
    );
    sendSuccess(res, item, "Menu item updated");
  },
);

export const deleteMenuItem = asyncHandler(
  async (req: Request<MenuItemIdParams>, res: Response): Promise<void> => {
    await menuItemService.remove(req.params.menuItemId);
    sendSuccess(res, null, "Menu item deleted");
  },
);
