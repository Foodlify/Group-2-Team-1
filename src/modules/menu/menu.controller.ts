import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { menuService } from "./menu.service";
import type {
  CreateMenuInput,
  MenuHistoryQuery,
  MenuIdParams,
  UpdateMenuInput,
} from "./menu.validation";

export const getMenu = asyncHandler(
  async (req: Request<MenuIdParams>, res: Response): Promise<void> => {
    const menu = await menuService.getByIdWithItems(req.params.menuId);
    sendSuccess(res, menu, "Menu retrieved");
  },
);

/** See `restaurant.controller` — the flag only applies to admins. */
const wantsDeleted = (req: Request): boolean =>
  req.user?.role === "ADMIN" &&
  (req.query as { includeDeleted?: boolean }).includeDeleted === true;

export const getMenuItems = asyncHandler(
  async (req: Request<MenuIdParams>, res: Response): Promise<void> => {
    const items = await menuService.listItems(
      req.params.menuId,
      wantsDeleted(req),
    );
    sendSuccess(res, items, "Menu items retrieved");
  },
);

// ─── Admin management (ADMIN only) ───────────────────────
export const createMenu = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const menu = await menuService.create(
      req.body as CreateMenuInput,
      req.user!.id,
    );
    sendSuccess(res, menu, "Menu created", 201);
  },
);

export const updateMenu = asyncHandler(
  async (req: Request<MenuIdParams>, res: Response): Promise<void> => {
    const menu = await menuService.update(
      req.params.menuId,
      req.body as UpdateMenuInput,
      req.user!.id,
    );
    sendSuccess(res, menu, "Menu updated");
  },
);

export const deleteMenu = asyncHandler(
  async (req: Request<MenuIdParams>, res: Response): Promise<void> => {
    await menuService.remove(req.params.menuId, req.user!.id);
    sendSuccess(res, null, "Menu deleted");
  },
);

export const restoreMenu = asyncHandler(
  async (req: Request<MenuIdParams>, res: Response): Promise<void> => {
    const menu = await menuService.restore(req.params.menuId, req.user!.id);
    sendSuccess(res, menu, "Menu restored");
  },
);

export const getMenuHistory = asyncHandler(
  async (req: Request<MenuIdParams>, res: Response): Promise<void> => {
    const { data, meta } = await menuService.history(
      req.params.menuId,
      req.query as unknown as MenuHistoryQuery,
    );
    sendSuccess(res, data, "Menu history retrieved", 200, meta);
  },
);
