import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import env from "../../config/env";
import logger from "../../config/logger";
import { appError } from "../../middlewares/error.middleware";
import { otpErrors } from "../exceptions/otp.errors";
import { describeError } from "../errors/describe";

class Mailer {
  private transporter: Transporter | null = null;

  constructor() {
    if (env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,

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

    let info;
    try {
      info = await this.transporter.sendMail({
        from: env.MAIL_FROM ?? env.SMTP_USER,
        to,
        subject,
        text,
      });
    } catch (error) {
      logger.error("Sending email failed", {
        to,
        subject,
        ...describeError(error),
      });
      throw appError(otpErrors.MAIL_SEND_FAILED);
    }

    if (info.rejected.length > 0) {
      logger.warn("Mail server rejected a recipient", {
        rejected: info.rejected,
        subject,
        response: info.response,
      });
    }

    logger.info("Email handed to the mail server", {
      to,
      subject,
      messageId: info.messageId,
      response: info.response,
    });
  }

  async sendOrderConfirmation(
    to: string,
    order: {
      id: string;
      customerName: string;
      totalPrice: number;
      items: Array<{ name: string; quantity: number; price: number }>;
    },
  ): Promise<void> {
    const lines = order.items
      .map((i) => `  - ${i.quantity} x ${i.name} (${i.price.toFixed(2)} EGP)`)
      .join("\n");
    const text =
      `Hi ${order.customerName},\n\n` +
      `We received your order #${order.id}.\n\n` +
      `${lines}\n\n` +
      `Total: ${order.totalPrice.toFixed(2)} EGP\n\n` +
      `We'll email you again whenever its status changes.`;
    await this.send(to, `Your Foodlify order #${order.id} is confirmed`, text);
  }

  async sendOrderStatusUpdate(
    to: string,
    order: { id: string; customerName: string; status: string },
  ): Promise<void> {
    const readable = order.status.toLowerCase().replace(/_/g, " ");
    const text =
      `Hi ${order.customerName},\n\n` +
      `Your order #${order.id} is now: ${readable}.\n\n` +
      `Thanks for using Foodlify.`;
    await this.send(to, `Foodlify order #${order.id}: ${readable}`, text);
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
