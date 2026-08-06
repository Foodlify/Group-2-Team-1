import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { addressService } from "../address/address.service";
import { customerService } from "./customer.service";
import type { AddressIdParams } from "./customer.validation";

// ─── Profile (me) ─────────────────────────────────────────

export const getMe = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customer = await customerService.getMe(req.user!.id);
    sendSuccess(res, customer, "Profile retrieved");
  },
);

export const updateMe = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customer = await customerService.updateMe(req.user!.id, req.body);
    sendSuccess(res, customer, "Profile updated");
  },
);

// ─── Addresses ────────────────────────────────────────────

export const listAddresses = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    const addresses = await addressService.listByCustomer(customerId);
    sendSuccess(res, addresses, "Addresses retrieved");
  },
);

export const addAddress = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    const address = await addressService.create(customerId, req.body);
    sendSuccess(res, address, "Address added", StatusCodes.CREATED);
  },
);

export const updateAddress = asyncHandler(
  async (req: Request<AddressIdParams>, res: Response): Promise<void> => {
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    const address = await addressService.update(
      customerId,
      req.params.addressId,
      req.body,
    );
    sendSuccess(res, address, "Address updated");
  },
);

export const deleteAddress = asyncHandler(
  async (req: Request<AddressIdParams>, res: Response): Promise<void> => {
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    await addressService.remove(customerId, req.params.addressId);
    sendSuccess(res, null, "Address deleted");
  },
);

export const setDefaultAddress = asyncHandler(
  async (req: Request<AddressIdParams>, res: Response): Promise<void> => {
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    const address = await addressService.setDefault(
      customerId,
      req.params.addressId,
    );
    sendSuccess(res, address, "Default address set");
  },
);
