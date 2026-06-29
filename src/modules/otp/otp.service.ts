import prisma from "../../config/prisma";
import { AppError } from "../../middlewares/error.middleware";
import { otpRepository } from "./otp.repository";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { OtpPurpose } from "./otp.model";

const OTP_EXPIRY_MINUTES = 10;
const MAX_OTPS_PER_WINDOW = 3;
const RATE_LIMIT_WINDOW_MINUTES = 10;
class OtpService {
  private generateOtp(): string {
    return crypto.randomInt(100000, 999999).toString();
  }
  async sendOtp(email: string, purpose: OtpPurpose) {
    // check the number of otp that send for last 5 mins, if exceeds to 3 then emits app error
    // the number of code that sent to that email,
    const recentOtps = await otpRepository.count({
      where: {
        email,
        purpose,
        createdAt: {
          gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000),
        },
      },
    });
    // how to know the number of request that comming
    if (recentOtps >= MAX_OTPS_PER_WINDOW) {
      throw new AppError("Too many otp requests", 429);
    }

    // delete the unused code before sending a new one
    await prisma.otp.deleteMany({
      where: {
        email,
        used: false,
      },
    });

    const code = this.generateOtp();
    const hashedCode = await bcrypt.hash(code, 10);

    await otpRepository.create({
      data: {
        email,
        code: hashedCode,
        purpose,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
      },
    });

    return {
      message: "code sent successfully",
      code,
    };
  }

  async verifyOtp(email: string, code: string, purpose: string) {
    const otp = await otpRepository.findFirst({
      where: { email, purpose, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) throw new AppError("Invalid or expired OTP", 400);

    // 2. MUST validate the submitted code against the stored hash
    const valid = await bcrypt.compare(code, otp.code);
    if (!valid) throw new AppError("Invalid OTP code", 400);

    // 3. Mark as used
    await otpRepository.update({
      where: { id: otp.id },
      data: { used: true },
    });

    return { message: "OTP verified successfully" };
  }
}

export const otpService = new OtpService();
