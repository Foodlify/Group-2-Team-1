import type { Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { customerService } from "./customer.service";

interface CustomerIdParams {
  customerId: string;
}

export const getMyProfile = asyncHandler(
  async (req: Request<CustomerIdParams>, res) => {
    const { customerId } = req.params;
    const profile = await customerService.getMyProfileService(customerId);
    res.status(200).json({ success: true, data: profile });
  },
);

export const getCustomerOrders = asyncHandler(
  async (req: Request<CustomerIdParams>, res) => {
    const { customerId } = req.params;
    const orders = await customerService.getCustomerOrdersService(customerId);
    res.status(200).json({ success: true, data: orders });
  },
);

export const getCustomerOrderHistory = asyncHandler(
  async (req: Request<CustomerIdParams>, res) => {
    const { customerId } = req.params;
    const orders =
      await customerService.getCustomerOrdersHistoryService(customerId);

    res.status(200).json({ success: true, data: orders });
  },
);

export const updateMyProfile = asyncHandler(
  async (req: Request<CustomerIdParams>, res) => {
    const { customerId } = req.params;
    const data = await customerService.updateMyProfileService(
      customerId,
      req.body,
    );
    res.status(200).json({ success: true, data });
  },
);

export const updateCustomerAddress = asyncHandler(async (req: Request, res) => {
  const { customerId, addressId } = req.params as {
    customerId: string;
    addressId: string;
  };
  const data = await customerService.updateCustomerAddressService(
    customerId,
    addressId,
    req.body,
  );
  res.status(200).json({ success: true, data });
});
