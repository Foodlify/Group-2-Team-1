import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { appError } from "../../middlewares/error.middleware";
import { customerService } from "../customer/customer.service";
import { transactionService } from "./transaction.service";
import { buildReceipt } from "./receipt.builder";
import {
  toAdminTransactionResponse,
  toTransactionResponse,
} from "./transaction.mapper";
import { transactionErrors } from "../../shared/exceptions/transaction.errors";
import type {
  TransactionIdParams,
  TransactionListQueryInput,
} from "./transaction.validation";

const pageMeta = (total: number, page: number, limit: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

export const listMyTransactions = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as TransactionListQueryInput;
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    const { rows, total } = await transactionService.listForCustomer(
      customerId,
      query,
    );
    sendSuccess(
      res,
      rows.map(toTransactionResponse),
      "Transactions retrieved",
      StatusCodes.OK,
      pageMeta(total, query.page, query.limit),
    );
  },
);

export const getMyReceipt = asyncHandler(
  async (req: Request<TransactionIdParams>, res: Response): Promise<void> => {
    const customerId = await customerService.requireCustomerIdByUserId(
      req.user!.id,
    );
    await respondWithReceipt(req.params.transactionId, res, customerId);
  },
);

export const listAllTransactions = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const query = req.query as unknown as TransactionListQueryInput;
    const { rows, total } = await transactionService.listAll(query);
    sendSuccess(
      res,
      rows.map(toAdminTransactionResponse),
      "Transactions retrieved",
      StatusCodes.OK,
      pageMeta(total, query.page, query.limit),
    );
  },
);

export const getReceipt = asyncHandler(
  async (req: Request<TransactionIdParams>, res: Response): Promise<void> => {
    await respondWithReceipt(req.params.transactionId, res);
  },
);

const respondWithReceipt = async (
  transactionId: string,
  res: Response,
  customerId?: string,
): Promise<void> => {
  const transaction = await transactionService.findReceiptSource(
    transactionId,
    customerId,
  );
  if (!transaction) throw appError(transactionErrors.TRANSACTION_NOT_FOUND);

  if (transaction.status !== "SUCCESS") {
    throw appError(transactionErrors.RECEIPT_NOT_SETTLED);
  }

  if (!transaction.order) {
    throw appError(transactionErrors.RECEIPT_NO_ORDER);
  }

  sendSuccess(res, buildReceipt(transaction, new Date()), "Receipt generated");
};
