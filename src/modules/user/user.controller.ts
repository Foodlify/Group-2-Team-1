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
    const { user, tokens } = await userService.register(req.body);
    setAuthCookies(res, tokens);
    sendSuccess(res, { user }, "Registered successfully", StatusCodes.CREATED);
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
    await userService.logout(req.user!.id);
    clearAuthCookies(res);
    sendSuccess(res, null, "Logged out successfully");
  },
);

// ─── Admin user management (CRUD) ─────────────────────────

export const listUsers = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await userService.list(req.query as unknown as UserQuery);
    sendSuccess(res, result.data, "Users retrieved", StatusCodes.OK, result.meta);
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
