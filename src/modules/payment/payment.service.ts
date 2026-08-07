import type { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../middlewares/error.middleware";
import { paymentErrors } from "../../shared/exceptions/payment.errors";
import { transactionService } from "../transaction/transaction.service";
import type { PaymentMethod } from "../transaction/transaction.model";
import type { PaymentContextData, PaymentStrategy } from "./payment.strategy";
import { cashOnDeliveryStrategy } from "./cash.strategy";

class PaymentService {
  private strategies: Map<PaymentMethod, PaymentStrategy> = new Map();

  constructor() {
    this.register(cashOnDeliveryStrategy);
  }

  register(strategy: PaymentStrategy) {
    this.strategies.set(strategy.method, strategy);
  }

  /**
   * Routes a payment to the strategy matching the given method, then
   * persists a Transaction record (PENDING/SUCCESS/FAILED) and returns it.
   * Pass `tx` to participate in the caller's database transaction.
   */
  async processPayment(
    method: PaymentMethod,
    amount: number,
    context: PaymentContextData,
    tx?: Prisma.TransactionClient,
  ) {
    const strategy = this.strategies.get(method);
    if (!strategy) {
      throw new AppError(
        paymentErrors.UNSUPPORTED_METHOD.message,
        paymentErrors.UNSUPPORTED_METHOD.statusCode,
      );
    }

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
}

export const paymentService = new PaymentService();
