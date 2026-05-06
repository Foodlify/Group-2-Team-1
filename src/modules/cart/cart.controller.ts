import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { cartService } from "./cart.service";
import type { CartItemIdParams } from "./cart.validation";

// ─── Test customer ID ────────────────────────────────────────
// TODO: Replace with `req.customer.id` once auth is implemented.
// For now, reads from env or falls back to a hardcoded default.
const getCurrentCustomerId = (_req: Request): string => {
  const id = process.env.TEST_CUSTOMER_ID;
  if (!id) {
    throw new Error(
      "TEST_CUSTOMER_ID is not set in .env — set it to the seeded customer's ID",
    );
  }
  return id;
};

// ─── Handlers ────────────────────────────────────────────

export const getMyCart = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = getCurrentCustomerId(req);

    const cart = await cartService.getMyCart(customerId);
    res.status(StatusCodes.OK).json({ success: true, data: cart });
  },
);

export const addItem = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = getCurrentCustomerId(req);
    const cart = await cartService.addItem(customerId, req.body);
    res.status(StatusCodes.CREATED).json({ success: true, data: cart });
  },
);

export const updateItem = asyncHandler(
  async (req: Request<CartItemIdParams>, res: Response): Promise<void> => {
    const customerId = getCurrentCustomerId(req);
    const cart = await cartService.updateItem(
      customerId,
      req.params.itemId,
      req.body,
    );
    res.status(StatusCodes.OK).json({ success: true, data: cart });
  },
);

export const removeItem = asyncHandler(
  async (req: Request<CartItemIdParams>, res: Response): Promise<void> => {
    const customerId = getCurrentCustomerId(req);
    const cart = await cartService.removeItem(customerId, req.params.itemId);
    res.status(StatusCodes.OK).json({ success: true, data: cart });
  },
);

export const clearCart = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = getCurrentCustomerId(req);
    await cartService.clearCart(customerId);
    res.status(StatusCodes.OK).json({ success: true, message: "Cart cleared" });
  },
);
