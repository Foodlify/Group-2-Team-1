import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { cartService } from "./cart.service";
import type { CartItemIdParams } from "./cart.validation";

// ─── Test user ID ────────────────────────────────────────
// TODO: Replace with `req.user.id` once auth is implemented.
// For now, reads from env or falls back to a hardcoded default.
export const getCurrentUserId = (_req: Request): string => {
  const id = process.env.TEST_USER_ID;
  console.log("req in controller", _req);
  if (!id) {
    throw new Error(
      "TEST_USER_ID is not set in .env — set it to the seeded user's ID",
    );
  }
  console.log("user id", id);

  return id;
};

// ─── Handlers ────────────────────────────────────────────

export const getMyCart = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = getCurrentUserId(req);
    console.log("userId", userId);
    const cart = await cartService.getMyCart(userId);
    res.status(200).json({ success: true, data: cart });
  },
);

export const addItem = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = getCurrentUserId(req);
    console.log("userId", userId);
    console.log("req.body", req.body);
    const cart = await cartService.addItem(userId, req.body);
    res.status(201).json({ success: true, data: cart });
  },
);

export const updateItem = asyncHandler(
  async (req: Request<CartItemIdParams>, res: Response): Promise<void> => {
    const userId = getCurrentUserId(req);
    const cart = await cartService.updateItem(
      userId,
      req.params.itemId,
      req.body,
    );
    res.status(200).json({ success: true, data: cart });
  },
);

export const removeItem = asyncHandler(
  async (req: Request<CartItemIdParams>, res: Response): Promise<void> => {
    const userId = getCurrentUserId(req);
    const cart = await cartService.removeItem(userId, req.params.itemId);
    res.status(200).json({ success: true, data: cart });
  },
);

export const clearCart = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = getCurrentUserId(req);
    await cartService.clearCart(userId);
    res.status(200).json({ success: true, message: "Cart cleared" });
  },
);
