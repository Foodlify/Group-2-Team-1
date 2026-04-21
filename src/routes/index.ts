import { Router } from "express";
import cartRouter from "../modules/cart/cart.routes";
// import userRouter from "../modules/user/user.routes";

const router: Router = Router();

// router.use("/users", userRouter);
router.use("/carts", cartRouter);

export default router;
