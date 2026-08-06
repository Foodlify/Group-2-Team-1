import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import env from "../../config/env";
import logger from "../../config/logger";
import { appError } from "../../middlewares/error.middleware";
import { otpErrors } from "../exceptions/otp.errors";

/**
 * Thin wrapper around nodemailer so services never touch SMTP details.
 *
 * Behaviour by environment:
 * - SMTP configured (SMTP_HOST set): real emails through the transport.
 * - Not configured, development/test: the message is logged instead of sent so
 *   the OTP flow stays fully testable without credentials.
 * - Not configured, production: sending fails with an operational 503 — better
 *   a clear error than silently swallowing verification codes.
 */
class Mailer {
  private transporter: Transporter | null = null;

  constructor() {
    if (env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        // Port 465 is implicit TLS; 587/25 upgrade via STARTTLS.
        secure: env.SMTP_PORT === 465,
        auth:
          env.SMTP_USER && env.SMTP_PASS
            ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
            : undefined,
      });
    }
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      if (env.NODE_ENV === "production") {
        throw appError(otpErrors.MAIL_NOT_CONFIGURED);
      }
      logger.info("Mailer not configured — dev fallback (email logged only)", {
        to,
        subject,
        text,
      });
      return;
    }

    await this.transporter.sendMail({
      from: env.MAIL_FROM ?? env.SMTP_USER,
      to,
      subject,
      text,
    });
  }

  async sendOtp(
    to: string,
    code: string,
    purpose: string,
    expiresInMinutes: number,
  ): Promise<void> {
    const subject = "Your Foodlify verification code";
    const text =
      `Your verification code is: ${code}\n\n` +
      `Purpose: ${purpose.replace("_", " ")}\n` +
      `This code expires in ${expiresInMinutes} minutes. ` +
      `If you didn't request it, you can safely ignore this email.`;
    await this.send(to, subject, text);
  }
}

export const mailer = new Mailer();
