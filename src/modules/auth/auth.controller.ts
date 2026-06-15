import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { authService } from "./auth.service";
import type { LoginRequest, RegisterRequest } from "./auth.validation";

export const login = asyncHandler(
  async (req: Request<unknown, unknown, LoginRequest>, res: Response): Promise<void> => {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.status(200).json({ success: true, data: result });
  },
);

export const register = asyncHandler(
  async (req: Request<unknown, unknown, RegisterRequest>, res: Response): Promise<void> => {
    const { name, email, password } = req.body;
    const result = await authService.register(name, email, password);
    res.status(201).json({ success: true, data: result });
  },
);

export const refresh = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body;
    const result = await authService.refresh(refreshToken);
    res.status(200).json({ success: true, data: result });
  },
);

export const logout = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.status(200).json({ success: true, message: "Logged out successfully" });
  },
);

export const getMe = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user;
    res.status(200).json({ success: true, data: user });
  },
);
