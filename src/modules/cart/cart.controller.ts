import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { AppError } from "../../middlewares/error.middleware";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { cartErrors } from "../../shared/exceptions/cart.errors";
import { customerService } from "../customer/customer.service";
import { cartService } from "./cart.service";
import type { CartOwner } from "./cart.model";
import type { CartItemIdParams } from "./cart.validation";

/** Header the guest cart's opaque token travels in, both ways. */
export const CART_TOKEN_HEADER = "x-cart-token";

const readGuestToken = (req: Request): string | undefined => {
  const value = req.headers[CART_TOKEN_HEADER];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/**
 * Resolves who the cart belongs to: the signed-in customer (403 if the
 * account has no customer profile) or the anonymous visitor identified by
 * `X-Cart-Token`.
 *
 * `createIfMissing` is only true for add-item — the one operation that may
 * legitimately start a brand-new guest cart. Reads and mutations of an
 * existing cart require the caller to already hold a token, so a missing
 * header can't silently create an empty cart on every request.
 */
const resolveOwner = async (
  req: Request,
  createIfMissing = false,
): Promise<CartOwner> => {
  if (req.user) {
    return {
      customerId: await customerService.requireCustomerIdByUserId(req.user.id),
    };
  }
  const guestToken = readGuestToken(req);
  if (guestToken) return { guestToken };
  if (!createIfMissing) {
    throw new AppError(
      cartErrors.GUEST_TOKEN_REQUIRED.message,
      cartErrors.GUEST_TOKEN_REQUIRED.statusCode,
    );
  }
  return { guestToken: cartService.newGuestToken() };
};

/** Echoes the token back so a guest client can keep using its cart. */
const exposeGuestToken = (res: Response, owner: CartOwner): void => {
  if ("guestToken" in owner) res.setHeader("X-Cart-Token", owner.guestToken);
};

// ─── Handlers ────────────────────────────────────────────

export const getMyCart = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const owner = await resolveOwner(req);
    const cart = await cartService.getMyCart(owner);
    sendSuccess(res, cart, "Cart retrieved");
  },
);

export const addItem = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const owner = await resolveOwner(req, true);
    const cart = await cartService.addItem(owner, req.body);
    exposeGuestToken(res, owner);
    sendSuccess(res, cart, "Item added", StatusCodes.CREATED);
  },
);

export const updateItem = asyncHandler(
  async (req: Request<CartItemIdParams>, res: Response): Promise<void> => {
    const owner = await resolveOwner(req);
    const cart = await cartService.updateItem(
      owner,
      req.params.itemId,
      req.body,
    );
    sendSuccess(res, cart, "Item updated");
  },
);

export const removeItem = asyncHandler(
  async (req: Request<CartItemIdParams>, res: Response): Promise<void> => {
    const owner = await resolveOwner(req);
    const cart = await cartService.removeItem(owner, req.params.itemId);
    sendSuccess(res, cart, "Item removed");
  },
);

export const clearCart = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const owner = await resolveOwner(req);
    await cartService.clearCart(owner);
    sendSuccess(res, null, "Cart cleared");
  },
);

export const sweepAbandonedCarts = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const result = await cartService.sweepAbandoned();
    sendSuccess(res, result, "Abandoned carts swept");
  },
);

export const mergeGuestCart = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    const cart = await cartService.mergeGuestCart(
      customerId,
      req.body.guestToken,
    );
    sendSuccess(res, cart, "Guest cart merged");
  },
);
