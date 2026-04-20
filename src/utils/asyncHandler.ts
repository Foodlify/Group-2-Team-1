import { Request, Response, NextFunction } from "express";

type AsyncFunction = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export const asyncHandler = (fn: AsyncFunction) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
};
