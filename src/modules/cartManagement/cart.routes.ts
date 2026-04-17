import express from 'express';
import { addToCartController } from './cart.controller';
import { clearCartController } from './cart.controller';
import { viewCartController } from './cart.controller';
import { deleteItemController } from './cart.controller';
import { updateQuantityController } from './cart.controller';


const router = express.Router();


router.route('/add').post(addToCartController);

router
  .route('modify/:cart-id')
  .put(updateQuantityController)
  .delete(deleteItemController);

router
.route('/:cart-id').get(viewCartController)
.delete(clearCartController);

export { router as cartRouter };
