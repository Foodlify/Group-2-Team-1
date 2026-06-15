import type { Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { restaurantService } from "./restaurant.service";

const getCurrentUserId = (): string => {
  const id = process.env.TEST_USER_ID;
  if (!id) throw new Error("TEST_USER_ID is not set in .env");
  return id;
};

export const register = asyncHandler(async (req: Request, res) => {
  const ownerId = getCurrentUserId();
  const restaurant = await restaurantService.register(ownerId, req.body);
  res.status(201).json({ success: true, data: restaurant });
});

export const getMyRestaurant = asyncHandler(async (req: Request, res) => {
  const ownerId = getCurrentUserId();
  const restaurant = await restaurantService.getMyRestaurant(ownerId);
  res.status(200).json({ success: true, data: restaurant });
});

export const updateMyRestaurant = asyncHandler(async (req: Request, res) => {
  const ownerId = getCurrentUserId();
  const restaurant = await restaurantService.updateMyRestaurant(ownerId, req.body);
  res.status(200).json({ success: true, data: restaurant });
});

export const getOrders = asyncHandler(async (req: Request, res) => {
  const ownerId = getCurrentUserId();
  const orders = await restaurantService.getOrders(ownerId);
  res.status(200).json({ success: true, data: orders });
});

export const updateOrderStatus = asyncHandler(async (req: Request, res) => {
  const ownerId = getCurrentUserId();
  const { orderId } = req.params as { orderId: string };
  const { status } = req.body;
  const order = await restaurantService.updateOrderStatus(ownerId, orderId, status);
  res.status(200).json({ success: true, data: order });
});
