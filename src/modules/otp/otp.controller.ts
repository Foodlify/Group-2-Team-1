import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { otpService } from "./otp.service";
import type { SendOtpInput, VerifyOtpInput } from "./otp.validation";

export const sendOtp = asyncHandler(
  async (
    req: Request<unknown, unknown, SendOtpInput>,
    res: Response,
  ): Promise<void> => {
    const { email, purpose } = req.body;
    const result = await otpService.sendOtp(email, purpose);
    // The code itself travels ONLY via email — the response carries the expiry.
    sendSuccess(res, result, "Verification code sent");
  },
);

export const verifyOtp = asyncHandler(
  async (
    req: Request<unknown, unknown, VerifyOtpInput>,
    res: Response,
  ): Promise<void> => {
    const { email, code, purpose } = req.body;
    await otpService.verifyOtp(email, code, purpose);
    sendSuccess(res, null, "OTP verified successfully");
  },
);
