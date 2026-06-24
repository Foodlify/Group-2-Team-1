import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { otpService } from "./otp.service";
import type { SendOtpInput, VerifyOtpInput } from "./otp.validation";

export const sendOtp = asyncHandler(async (req, res) => {
  const { email, purpose } = req.params;
  const result = otpService.sendOtp(email, purpose);
  res.status(200).json({ success: true, data: result });
});

export const verifyOtp = asyncHandler(
  async (
    req: Request<unknown, unknown, VerifyOtpInput>,
    res: Response,
  ): Promise<void> => {
    const { email, code, purpose } = req.body;
    const result = await otpService.verifyOtp(email, code, purpose);
    res.status(200).json({ success: true, data: result });
  },
);
