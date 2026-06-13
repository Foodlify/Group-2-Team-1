import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { customerService } from "../customer/customer.service";
import { orderService } from "./order.service";
import type { OrderIdParams, OrderQuery } from "./order.validation";

// Resolves the current customer id from the authenticated user (set by
// `authenticate`). Throws 403 if the account is not a customer.
const getCurrentCustomerId = (req: Request): Promise<string> =>
  customerService.requireCustomerIdByUserId(req.user!.id);

// ─── Handlers ────────────────────────────────────────────

export const placeOrder = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
    const order = await orderService.placeOrder(customerId, req.body);
    res.status(StatusCodes.CREATED).json({ success: true, data: order });
  },
);

export const getMyOrders = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
    const result = await orderService.getMyOrders(
      customerId,
      req.query as unknown as OrderQuery,
    );
    res.status(StatusCodes.OK).json({ success: true, data: result.data, meta: result.meta });
  },
);

export const getOrderById = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
    const order = await orderService.getOrderById(customerId, req.params.orderId);
    res.status(StatusCodes.OK).json({ success: true, data: order });
  },
);

// ─── Admin handlers ───────────────────────────────────────

export const listAllOrders = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await orderService.listAllOrders(
      req.query as unknown as OrderQuery,
    );
    res.status(StatusCodes.OK).json({ success: true, data: result.data, meta: result.meta });
  },
);

export const getAnyOrder = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const order = await orderService.getAnyOrder(req.params.orderId);
    res.status(StatusCodes.OK).json({ success: true, data: order });
  },
);

export const cancelOrder = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
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

export const addOrderStatusTracking = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const order = await orderService.addOrderStatusTracking(req.params.orderId, req.body);
    res.status(StatusCodes.CREATED).json({ success: true, data: order });
  },
);

