import { Router } from "express";
import { authLimiter } from "../middlewares/rateLimit.middleware";
import cartRouter from "../modules/cart/cart.routes";
import orderRouter from "../modules/order/order.routes";
import { authRouter, usersRouter } from "../modules/user/user.routes";
import otpRouter from "../modules/otp/otp.routes";
import customerRouter from "../modules/customer/customer.routes";
import restaurantRouter from "../modules/restaurant/restaurant.routes";
import menuRouter from "../modules/menu/menu.routes";
import menuItemRouter from "../modules/menuItem/menuItem.routes";

const router: Router = Router();

// Strict limiter in front of auth endpoints to blunt brute-force / credential
// stuffing (login, register, refresh, admin login).
router.use("/auth", authLimiter, authRouter);
// OTP endpoints are as abuse-prone as login — same strict limiter (plus the
// service's own per-email cap of 3 codes / 10 minutes).
router.use("/otp", authLimiter, otpRouter);
router.use("/users", usersRouter);
router.use("/customers", customerRouter);
router.use("/restaurants", restaurantRouter);
router.use("/menus", menuRouter);
router.use("/menu-items", menuItemRouter);
router.use("/carts", cartRouter);
router.use("/orders", orderRouter);

export default router;
