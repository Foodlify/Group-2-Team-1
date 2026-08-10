import type { Prisma } from "../../generated/prisma/client";
import type { TransactionModel } from "../../generated/prisma/models";
import { AppError, appError } from "../../middlewares/error.middleware";
import logger from "../../config/logger";
import { paymentErrors } from "../../shared/exceptions/payment.errors";
import { describeError } from "../../shared/errors/describe";
import {
  transactionService,
  type PendingGatewayRefund,
} from "../transaction/transaction.service";
import type { PaymentMethod } from "../transaction/transaction.model";
import { toTransactionResponse } from "../transaction/transaction.mapper";
import type {
  PaymentContextData,
  PaymentInitiation,
  PaymentStrategy,
} from "./payment.strategy";
import { cashOnDeliveryStrategy } from "./cash.strategy";
import { stripeCardStrategy } from "./stripe.strategy";
import { isStripeConfigured } from "./stripe.client";
import { paymentIntegrationService } from "./integration.service";
import type { TransactionResponse } from "./payment.validation";

class PaymentService {
  private strategies: Map<PaymentMethod, PaymentStrategy> = new Map();

  constructor() {
    this.register(cashOnDeliveryStrategy);

    if (isStripeConfigured()) {
      this.register(stripeCardStrategy);
      logger.info("Stripe card payments enabled");
    }
  }

  register(strategy: PaymentStrategy) {
    this.strategies.set(strategy.method, strategy);
  }

  async processPayment(
    method: PaymentMethod,
    amount: number,
    context: PaymentContextData,
    tx?: Prisma.TransactionClient,
  ) {
    const strategy = this.requireStrategy(method);

    await paymentIntegrationService.assertMethodEnabled(method);

    const result = await strategy.pay(amount, context);

    return transactionService.createTransaction(
      {
        type: "ORDER_PAYMENT",
        amount,
        currency: context.currency,
        status: result.status,
        paymentMethod: method,
        externalRef: result.externalRef,
        orderId: context.orderId,
        metadata: result.metadata,
      },
      tx,
    );
  }

  async initiatePayment(
    method: PaymentMethod,
    transaction: TransactionModel,
    amount: number,
    context: PaymentContextData,
  ): Promise<PaymentInitiation> {
    const strategy = this.requireStrategy(method);
    if (!strategy.initiate) return {};

    const initiation = await strategy.initiate(transaction, amount, context);

    if (initiation.externalRef || initiation.metadata) {
      await transactionService.attachGatewayReference(transaction.id, {
        externalRef: initiation.externalRef,
        metadata: initiation.metadata,
      });
    }

    return initiation;
  }

  async refundPayments(refunds: PendingGatewayRefund[]): Promise<void> {
    for (const { refund, payment } of refunds) {
      const strategy = this.strategies.get(payment.paymentMethod);
      if (!strategy?.refund) {
        logger.error("No refund strategy for a settled payment", {
          transactionId: refund.id,
          orderId: refund.orderId,
          method: payment.paymentMethod,
        });
        await transactionService.recordGatewayOutcome(refund.id, "FAILED", {
          metadata: { error: "no refund strategy for this payment method" },
        });
        continue;
      }

      try {
        const outcome = await strategy.refund(
          refund,
          payment,
          Number(refund.amount),
        );
        await transactionService.recordGatewayOutcome(
          refund.id,
          outcome.status,
          {
            externalRef: outcome.externalRef,
            metadata: outcome.metadata,
          },
        );
        logger.info("Refund sent to the gateway", {
          transactionId: refund.id,
          orderId: refund.orderId,
          status: outcome.status,
          externalRef: outcome.externalRef,
        });
      } catch (error) {
        logger.error("Gateway refund failed — money is still owed", {
          transactionId: refund.id,
          orderId: refund.orderId,
          amount: String(refund.amount),
          ...describeError(error),
        });
        try {
          await transactionService.recordGatewayOutcome(refund.id, "FAILED", {
            metadata: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
        } catch (writeError) {
          logger.error("Could not record the failed refund", {
            transactionId: refund.id,
            ...describeError(writeError),
          });
        }
      }
    }
  }

  async retryRefund(transactionId: string): Promise<TransactionResponse> {
    const refund = await transactionService.findById(transactionId);
    if (!refund || refund.type !== "REFUND") {
      throw appError(paymentErrors.REFUND_NOT_FOUND);
    }
    if (refund.status === "SUCCESS") {
      throw appError(paymentErrors.REFUND_ALREADY_SETTLED);
    }

    const payment = await transactionService.findPaymentForRefund(refund);
    if (!payment) {
      await transactionService.recordGatewayOutcome(refund.id, "FAILED", {
        metadata: { error: "no successful payment found for this order" },
      });
      throw appError(paymentErrors.REFUND_NO_PAYMENT);
    }

    await this.refundPayments([{ refund, payment }]);

    const settled = await transactionService.findById(transactionId);
    return toTransactionResponse(settled ?? refund);
  }

  async outstandingRefunds(limit?: number): Promise<TransactionResponse[]> {
    const refunds = await transactionService.findOutstandingRefunds(limit);
    return refunds.map(toTransactionResponse);
  }

  supportedMethods(): PaymentMethod[] {
    return [...this.strategies.keys()];
  }

  private requireStrategy(method: PaymentMethod): PaymentStrategy {
    const strategy = this.strategies.get(method);
    if (!strategy) {
      throw new AppError(
        paymentErrors.UNSUPPORTED_METHOD.message,
        paymentErrors.UNSUPPORTED_METHOD.statusCode,
      );
    }
    return strategy;
  }
}

export const paymentService = new PaymentService();
