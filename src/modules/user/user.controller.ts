import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../shared/auth/cookie.helper";
import { userService } from "./user.service";
import type { UserIdParams, UserQuery } from "./user.validation";

// ─── Auth (customer + admin) ──────────────────────────────

export const register = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // No cookies here on purpose — the account is unusable until the emailed
    // code is verified, which is what logs the customer in.
    const { user } = await userService.register(req.body);
    sendSuccess(
      res,
      { user },
      "Registered — check your email for the verification code",
      StatusCodes.CREATED,
    );
  },
);

export const verifyEmail = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { user, tokens } = await userService.verifyEmail(req.body);
    setAuthCookies(res, tokens);
    sendSuccess(res, { user }, "Email verified — you are now logged in");
  },
);

export const login = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { user, tokens } = await userService.login(req.body);
    setAuthCookies(res, tokens);
    sendSuccess(res, { user }, "Logged in successfully");
  },
);

export const adminLogin = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { user, tokens } = await userService.adminLogin(req.body);
    setAuthCookies(res, tokens);
    sendSuccess(res, { user }, "Logged in successfully");
  },
);

export const refresh = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const { user, tokens } = await userService.refresh(token);
    setAuthCookies(res, tokens);
    sendSuccess(res, { user }, "Token refreshed");
  },
);

export const logout = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // Revoke via the refresh cookie so logout works even if the access token
    // has already expired. Always clear cookies regardless.
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await userService.logout(token);
    clearAuthCookies(res);
    sendSuccess(res, null, "Logged out successfully");
  },
);

export const forgotPassword = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await userService.forgotPassword(req.body.email);
    // Identical response whether or not the account exists.
    sendSuccess(
      res,
      null,
      "If that email is registered, a reset code has been sent",
    );
  },
);

export const resetPassword = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await userService.resetPassword(req.body);
    sendSuccess(res, null, "Password reset successfully — please log in again");
  },
);

// ─── Account status ───────────────────────────────────────

export const setUserStatus = asyncHandler(
  async (req: Request<UserIdParams>, res: Response): Promise<void> => {
    const user = await userService.setActive(req.params.id, req.body.isActive);
    sendSuccess(
      res,
      user,
      user.isActive ? "Account enabled" : "Account disabled",
    );
  },
);

export const deactivateMyAccount = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await userService.deactivateSelf(req.user!.id);
    clearAuthCookies(res);
    sendSuccess(res, null, "Account deactivated");
  },
);

// ─── Admin user management (CRUD) ─────────────────────────

export const listUsers = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await userService.list(req.query as unknown as UserQuery);
    sendSuccess(
      res,
      result.data,
      "Users retrieved",
      StatusCodes.OK,
      result.meta,
    );
  },
);

export const getUser = asyncHandler(
  async (req: Request<UserIdParams>, res: Response): Promise<void> => {
    const user = await userService.findById(req.params.id);
    sendSuccess(res, user, "User retrieved");
  },
);

export const createUser = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await userService.create(req.body);
    sendSuccess(res, user, "User created", StatusCodes.CREATED);
  },
);

export const updateUser = asyncHandler(
  async (req: Request<UserIdParams>, res: Response): Promise<void> => {
    const user = await userService.update(req.params.id, req.body);
    sendSuccess(res, user, "User updated");
  },
);

export const deleteUser = asyncHandler(
  async (req: Request<UserIdParams>, res: Response): Promise<void> => {
    await userService.remove(req.params.id);
    sendSuccess(res, null, "User deleted");
  },
);
