import express from 'express';
import { cartRouter } from '../modules/cartManagement/cart.routes';

const router = express.Router();

router.use('/cart',cartRouter);

export default router