import type { Prisma } from "../../generated/prisma/client";
import type {
  PaymentMethod,
  TransactionStatus,
} from "../transaction/transaction.model";
import type { TransactionModel } from "../../generated/prisma/models";

export interface PaymentContextData {
  orderId: string;
  customerId: string;
  currency: string;
}

export interface PaymentResult {
  status: TransactionStatus;
  externalRef?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface PaymentInitiation {
  externalRef?: string;
  redirectUrl?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface RefundOutcome {
  status: TransactionStatus;
  externalRef?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface PaymentStrategy {
  readonly method: PaymentMethod;

  pay(amount: number, context: PaymentContextData): Promise<PaymentResult>;

  initiate?(
    transaction: TransactionModel,
    amount: number,
    context: PaymentContextData,
  ): Promise<PaymentInitiation>;

  refund?(
    refundTransaction: TransactionModel,
    originalPayment: TransactionModel,
    amount: number,
  ): Promise<RefundOutcome>;
}
