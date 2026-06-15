import type { Request, Response, NextFunction } from "express";

export const authorize = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      _res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      _res.status(403).json({ success: false, message: "Insufficient permissions" });
      return;
    }

    next();
  };
};
