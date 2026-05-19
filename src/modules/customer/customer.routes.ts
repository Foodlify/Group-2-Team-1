import { Router } from "express";
import * as controller from "./customer.controller";

const router = Router();

router.get("/my-profile/:customerId", controller.getMyProfile);

export default router;
