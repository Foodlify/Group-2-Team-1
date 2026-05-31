import { Router } from "express";
import cartRouter from "../modules/cart/cart.routes";
import orderRouter from "../modules/order/order.routes";
import { authRouter, usersRouter } from "../modules/user/user.routes";
import restaurantRouter from "../modules/restaurant/restaurant.routes";
import menuRouter from "../modules/menu/menu.routes";
import menuItemRouter from "../modules/menuItem/menuItem.routes";

const router: Router = Router();

router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/restaurants", restaurantRouter);
router.use("/menus", menuRouter);
router.use("/menu-items", menuItemRouter);
router.use("/carts", cartRouter);
router.use("/orders", orderRouter);

export default router;
