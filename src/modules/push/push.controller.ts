import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { customerService } from "../customer/customer.service";
import { pushService } from "./push.service";
import type {
  PushSubscriptionInput,
  UnsubscribeInput,
} from "./push.validation";

const getCurrentCustomerId = (req: Request): Promise<string> =>
  customerService.requireCustomerIdByUserId(req.user!.id);

export const getPublicKey = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    sendSuccess(res, { publicKey: pushService.publicKey() }, "Public key");
  },
);

export const subscribe = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
    const subscription = await pushService.subscribe(
      customerId,
      req.body as PushSubscriptionInput,
      // Stored only so a customer can tell one device from another in the
      // list. Truncated: this header is attacker-controlled and unbounded.
      req.get("user-agent")?.slice(0, 255),
    );
    sendSuccess(res, subscription, "Subscribed", StatusCodes.CREATED);
  },
);

export const unsubscribe = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
    await pushService.unsubscribe(
      customerId,
      (req.body as UnsubscribeInput).endpoint,
    );
    sendSuccess(res, null, "Unsubscribed");
  },
);

export const listMine = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const customerId = await getCurrentCustomerId(req);
    sendSuccess(res, await pushService.listMine(customerId), "Subscriptions");
  },
);
