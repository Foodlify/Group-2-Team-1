import { Router } from "express";
import { authLimiter } from "../middlewares/rateLimit.middleware";
import cartRouter from "../modules/cart/cart.routes";
import orderRouter from "../modules/order/order.routes";
import { authRouter, usersRouter } from "../modules/user/user.routes";
import otpRouter from "../modules/otp/otp.routes";
import customerRouter from "../modules/customer/customer.routes";
import {
  myRatingsRouter,
  restaurantDiscoveryRouter,
  restaurantRatingsRouter,
} from "../modules/rating/rating.routes";
import {
  adminSupportRouter,
  mySupportRouter,
} from "../modules/support/support.routes";
import restaurantRouter from "../modules/restaurant/restaurant.routes";
import dashboardRouter from "../modules/dashboard/dashboard.routes";
import { paymentAdminRouter } from "../modules/payment/payment.routes";
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
// Specific mounts registered BEFORE their parent prefixes so they match first.
router.use("/customers/me/ratings", myRatingsRouter);
router.use("/customers/me/support-tickets", mySupportRouter);
router.use("/customers", customerRouter);
router.use("/support-tickets", adminSupportRouter);
router.use("/restaurants", restaurantDiscoveryRouter);
router.use("/restaurants/:restaurantId/ratings", restaurantRatingsRouter);
router.use("/restaurants", restaurantRouter);
router.use("/menus", menuRouter);
router.use("/menu-items", menuItemRouter);
router.use("/carts", cartRouter);
router.use("/orders", orderRouter);
router.use("/dashboard", dashboardRouter);
// The Stripe webhook lives at /payments/stripe/webhook and is mounted directly
// on the app, ahead of this router — see app.ts.
router.use("/payments", paymentAdminRouter);

export default router;
