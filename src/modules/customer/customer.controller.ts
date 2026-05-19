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
