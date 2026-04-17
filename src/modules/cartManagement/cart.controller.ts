import { Request, Response } from 'express';
import {
  addToCartService,
  deleteItemService,
  updateQuantityService,
  viewCartService,
  clearCartService,
} from './cart.service';

export const addToCartController = (req: Request, res: Response) => {
  addToCartService();
  res.status(200).json({
    message: 'Item added',
  });
};

export const deleteItemController = (req: Request, res: Response) => {
  deleteItemService();
  res.status(200).json({
    message: '',
  });
};

export const updateQuantityController = (req: Request, res: Response) => {
  updateQuantityService();
  res.status(200).json({
    message: '',
  });
};

export const viewCartController = (req: Request, res: Response) => {
  viewCartService();
  res.status(200).json({
    message: '',
  });
};

export const clearCartController = (req: Request, res: Response) => {
  clearCartService();
  res.status(200).json({
    message: '',
  });
};
