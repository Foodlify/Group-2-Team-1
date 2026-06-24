import { AppError } from "../../middlewares/error.middleware";
import { otpRepository } from "./otp.repository";

class OtpService {
  async sendOtp(email: string, purpose: string) {
    // TODO: implement
    throw new AppError("Not implemented", 501);
  }

  async verifyOtp(email: string, code: string, purpose: string) {
    // TODO: implement
    throw new AppError("Not implemented", 501);
  }
}

export const otpService = new OtpService();
