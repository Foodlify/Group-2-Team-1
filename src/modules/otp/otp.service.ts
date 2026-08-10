import crypto from "crypto";
import { appError } from "../../middlewares/error.middleware";
import { otpErrors } from "../../shared/exceptions/otp.errors";
import {
  comparePassword,
  hashPassword,
} from "../../shared/auth/password.helper";
import { mailer } from "../../shared/mail/mailer";
import { otpRepository } from "./otp.repository";
import type { OtpPurpose } from "./otp.validation";

const OTP_EXPIRY_MINUTES = 10;
const MAX_OTPS_PER_WINDOW = 3;
const RATE_LIMIT_WINDOW_MINUTES = 10;

class OtpService {
  private generateCode(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  async sendOtp(
    email: string,
    purpose: OtpPurpose,
  ): Promise<{ expiresAt: string }> {
    const windowStart = new Date(
      Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    );
    const recent = await otpRepository.countRecent(email, purpose, windowStart);
    if (recent >= MAX_OTPS_PER_WINDOW) {
      throw appError(otpErrors.TOO_MANY_REQUESTS);
    }

    await otpRepository.deleteUnused(email, purpose);

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await otpRepository.create({
      data: { email, codeHash: await hashPassword(code), purpose, expiresAt },
    });

    await mailer.sendOtp(email, code, purpose, OTP_EXPIRY_MINUTES);

    return { expiresAt: expiresAt.toISOString() };
  }

  async verifyOtp(
    email: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const otp = await otpRepository.findLatestValid(email, purpose);
    if (!otp) throw appError(otpErrors.INVALID_OTP);

    const valid = await comparePassword(code, otp.codeHash);
    if (!valid) throw appError(otpErrors.INVALID_OTP);

    await otpRepository.markUsed(otp.id);
  }
}

export const otpService = new OtpService();
