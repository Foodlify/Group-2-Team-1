import type { Prisma } from "../../generated/prisma/client";
import type {
  PaymentMethod,
  TransactionStatus,
} from "../transaction/transaction.model";

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

export interface PaymentStrategy {
  readonly method: PaymentMethod;
  pay(amount: number, context: PaymentContextData): Promise<PaymentResult>;
}
