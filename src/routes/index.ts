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
import {
  adminTransactionsRouter,
  myTransactionsRouter,
} from "../modules/transaction/transaction.routes";
import auditRouter from "../modules/auditing/auditing.routes";
import pushRouter from "../modules/push/push.routes";
import menuRouter from "../modules/menu/menu.routes";
import menuItemRouter from "../modules/menuItem/menuItem.routes";

const router: Router = Router();

router.use("/auth", authLimiter, authRouter);

router.use("/otp", authLimiter, otpRouter);
router.use("/users", usersRouter);

router.use("/customers/me/ratings", myRatingsRouter);
router.use("/customers/me/support-tickets", mySupportRouter);
router.use("/customers/me/transactions", myTransactionsRouter);
router.use("/customers", customerRouter);
router.use("/transactions", adminTransactionsRouter);
router.use("/audit-events", auditRouter);
router.use("/support-tickets", adminSupportRouter);
router.use("/restaurants", restaurantDiscoveryRouter);
router.use("/restaurants/:restaurantId/ratings", restaurantRatingsRouter);
router.use("/restaurants", restaurantRouter);
router.use("/menus", menuRouter);
router.use("/menu-items", menuItemRouter);
router.use("/carts", cartRouter);
router.use("/orders", orderRouter);
router.use("/dashboard", dashboardRouter);
router.use("/push", pushRouter);

router.use("/payments", paymentAdminRouter);

export default router;
