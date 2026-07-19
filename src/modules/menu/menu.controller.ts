import { asyncHandler } from "../../utils/asyncHandler";
import { menuService } from "./menu.service";

export const createMenu = asyncHandler(async (req, res) => {
  const data = req.body;
  const menu = await menuService.createMenuService(data);
  res.status(201).json({ success: true, data: menu });
});
