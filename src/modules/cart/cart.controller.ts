import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { customerService } from "../customer/customer.service";
import { cartService } from "./cart.service";
import type { CartItemIdParams } from "./cart.validation";

// Resolves the current customer id from the authenticated user (set by
// `authenticate`). Throws 403 if the account is not a customer.
const getCurrentCustomerId = (req: Request): Promise<string> =>
  customerService.requireCustomerIdByUserId(req.user!.id);

// ─── Handlers ────────────────────────────────────────────

export const getMyCart = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);

    const cart = await cartService.getMyCart(customerId);
    res.status(StatusCodes.OK).json({ success: true, data: cart });
  },
);

export const addItem = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
    const cart = await cartService.addItem(customerId, req.body);
    res.status(StatusCodes.CREATED).json({ success: true, data: cart });
  },
);

export const updateItem = asyncHandler(
  async (req: Request<CartItemIdParams>, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
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
    const customerId = await getCurrentCustomerId(req);
    const cart = await cartService.removeItem(customerId, req.params.itemId);
    res.status(StatusCodes.OK).json({ success: true, data: cart });
  },
);

export const clearCart = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
    await cartService.clearCart(customerId);
    res.status(StatusCodes.OK).json({ success: true, message: "Cart cleared" });
  },
);
