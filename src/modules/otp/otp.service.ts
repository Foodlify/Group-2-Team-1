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

/**
 * Email OTP flow (ported from Kamal's `customer-management` branch).
 * Changes from the original:
 * - the code is EMAILED (nodemailer), never returned in the API response;
 * - pending-code invalidation is scoped to the same purpose;
 * - hashing goes through the shared password helper.
 */
class OtpService {
  private generateCode(): string {
    // crypto.randomInt is unbiased — always six digits (100000–999999).
    return crypto.randomInt(100000, 1000000).toString();
  }

  async sendOtp(
    email: string,
    purpose: OtpPurpose,
  ): Promise<{ expiresAt: string }> {
    // App-level rate limit per email+purpose, independent of the HTTP limiter
    // (which is per-IP and can't stop a distributed guesser).
    const windowStart = new Date(
      Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    );
    const recent = await otpRepository.countRecent(email, purpose, windowStart);
    if (recent >= MAX_OTPS_PER_WINDOW) {
      throw appError(otpErrors.TOO_MANY_REQUESTS);
    }

    // Single active code per email+purpose — a new request voids older codes.
    await otpRepository.deleteUnused(email, purpose);

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await otpRepository.create({
      data: { email, codeHash: await hashPassword(code), purpose, expiresAt },
    });

    // Send AFTER persisting — if the mail transport throws, no orphaned
    // "sent" state exists and the client simply retries.
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
