import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { orderService } from "./order.service";
import { getCurrentUserId } from "../cart/cart.controller";
import type { OrderIdParams, UpdateOrderRequest } from "./order.validation";

export const getMyOrders = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const customerId = getCurrentUserId(_req);
    const orders = await orderService.getOrdersByCustomer(customerId);
    res.status(200).json({ success: true, data: orders });
  },
);

export const createOrder = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = getCurrentUserId(req);
    const { addressId } = req.body;
    const order = await orderService.createOrder(customerId, addressId);
    res.status(201).json({ success: true, data: order });
  },
);

export const getOrderById = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const customerId = getCurrentUserId(req);
    const { orderId } = req.params;
    const order = await orderService.getOrderById(customerId, orderId);
    res.status(200).json({ success: true, data: order });
  },
);

export const updateOrder = asyncHandler(
  async (req: Request<OrderIdParams, unknown, UpdateOrderRequest>, res: Response): Promise<void> => {
    const customerId = getCurrentUserId(req);
    const { orderId } = req.params;
    const order = await orderService.updateOrder(customerId, orderId, req.body);
    res.status(200).json({ success: true, data: order });
  },
);

export const cancelOrder = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const customerId = getCurrentUserId(req);
    const { orderId } = req.params;
    await orderService.cancelOrder(customerId, orderId);
    res.status(200).json({ success: true, message: "Order cancelled" });
  },
);
