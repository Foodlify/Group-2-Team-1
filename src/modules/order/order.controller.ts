import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { orderService } from "./order.service";
import type { OrderIdParams } from "./order.validation";

// TODO: Replace with `req.customer.id` once auth is implemented.
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

export const placeOrder = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = getCurrentCustomerId(req);
    const order = await orderService.placeOrder(customerId, req.body);
    res.status(StatusCodes.CREATED).json({ success: true, data: order });
  },
);

export const getMyOrders = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = getCurrentCustomerId(req);
    const result = await orderService.getMyOrders(customerId, req.query as never);
    res.status(StatusCodes.OK).json({ success: true, data: result.data, meta: result.meta });
  },
);

export const getOrderById = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const customerId = getCurrentCustomerId(req);
    const order = await orderService.getOrderById(customerId, req.params.orderId);
    res.status(StatusCodes.OK).json({ success: true, data: order });
  },
);

export const cancelOrder = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const customerId = getCurrentCustomerId(req);
    const order = await orderService.cancelOrder(customerId, req.params.orderId);
    res.status(StatusCodes.OK).json({ success: true, data: order });
  },
);

export const updateOrderStatus = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const order = await orderService.updateOrderStatus(req.params.orderId, req.body);
    res.status(StatusCodes.OK).json({ success: true, data: order });
  },
);

export const addTracking = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const order = await orderService.addTracking(req.params.orderId, req.body);
    res.status(StatusCodes.CREATED).json({ success: true, data: order });
  },
);

