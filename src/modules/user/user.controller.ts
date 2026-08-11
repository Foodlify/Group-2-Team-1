import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  OAUTH_STATE_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  clearOAuthStateCookie,
  setAuthCookies,
  setOAuthStateCookie,
} from "../../shared/auth/cookie.helper";
import { AppError } from "../../middlewares/error.middleware";
import { userErrors } from "../../shared/exceptions/user.errors";
import { googleAuthClient } from "../../shared/auth/google.client";
import env from "../../config/env";
import { userService } from "./user.service";
import type { UserIdParams, UserQuery } from "./user.validation";

export const register = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
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

const stateMatches = (sent: unknown, received: unknown): boolean => {
  if (typeof sent !== "string" || typeof received !== "string") return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(received);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
};

export const googleRedirect = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const state = randomBytes(32).toString("base64url");

    const url = googleAuthClient.authorizationUrl(state);
    setOAuthStateCookie(res, state);
    res.redirect(url);
  },
);

export const googleCallback = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { code, state, error } = req.query;

    const expectedState = req.cookies?.[OAUTH_STATE_COOKIE] as unknown;
    clearOAuthStateCookie(res);

    if (typeof error === "string" && error) {
      throw new AppError(
        userErrors.GOOGLE_EXCHANGE_FAILED.message,
        userErrors.GOOGLE_EXCHANGE_FAILED.statusCode,
      );
    }
    if (!stateMatches(expectedState, state)) {
      throw new AppError(
        userErrors.GOOGLE_STATE_MISMATCH.message,
        userErrors.GOOGLE_STATE_MISMATCH.statusCode,
      );
    }
    if (typeof code !== "string" || !code) {
      throw new AppError(
        userErrors.GOOGLE_EXCHANGE_FAILED.message,
        userErrors.GOOGLE_EXCHANGE_FAILED.statusCode,
      );
    }

    const profile = await googleAuthClient.exchangeCode(code);
    const { user, tokens } = await userService.loginWithGoogle(profile);
    setAuthCookies(res, tokens);

    if (env.GOOGLE_POST_LOGIN_REDIRECT) {
      res.redirect(env.GOOGLE_POST_LOGIN_REDIRECT);
      return;
    }
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
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await userService.logout(token);
    clearAuthCookies(res);
    sendSuccess(res, null, "Logged out successfully");
  },
);

export const forgotPassword = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await userService.forgotPassword(req.body.email);

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
