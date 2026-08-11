import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { customerService } from "../customer/customer.service";
import { orderService } from "./order.service";
import type {
  OrderIdParams,
  OrderQuery,
  ScopedOrderQuery,
} from "./order.validation";

const getCurrentCustomerId = (req: Request): Promise<string> =>
  customerService.requireCustomerIdByUserId(req.user!.id);

const actorOf = (req: Request) => ({
  userId: req.user!.id,
  role: req.user!.role,
});

export const placeOrder = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
    const order = await orderService.placeOrder(customerId, req.body);
    sendSuccess(res, order, "Order placed successfully", StatusCodes.CREATED);
  },
);

export const getMyOrders = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
    const result = await orderService.getMyOrders(
      customerId,
      req.query as unknown as OrderQuery,
    );
    sendSuccess(
      res,
      result.data,
      "Orders retrieved",
      StatusCodes.OK,
      result.meta,
    );
  },
);

export const getOrderById = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
    const order = await orderService.getOrderById(
      customerId,
      req.params.orderId,
    );
    sendSuccess(res, order, "Order retrieved");
  },
);

export const listAllOrders = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await orderService.listAllOrders(
      req.query as unknown as ScopedOrderQuery,
    );
    sendSuccess(
      res,
      result.data,
      "Orders retrieved",
      StatusCodes.OK,
      result.meta,
    );
  },
);

export const getAnyOrder = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const order = await orderService.getAnyOrder(req.params.orderId);
    sendSuccess(res, order, "Order retrieved");
  },
);

export const cancelOrder = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
    const order = await orderService.cancelOrder(
      customerId,
      req.params.orderId,
    );
    sendSuccess(res, order, "Order cancelled");
  },
);

export const updateOrderStatus = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const order = await orderService.updateOrderStatus(
      req.params.orderId,
      req.body,
      actorOf(req),
    );
    sendSuccess(res, order, "Order status updated");
  },
);

export const addOrderStatusTracking = asyncHandler(
  async (req: Request<OrderIdParams>, res: Response): Promise<void> => {
    const order = await orderService.addOrderStatusTracking(
      req.params.orderId,
      req.body,
    );
    sendSuccess(res, order, "Tracking added", StatusCodes.CREATED);
  },
);
