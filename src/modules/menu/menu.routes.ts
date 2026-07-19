import Router from "express";
import * as menuController from "./menu.controller";
import { validate } from "../../middlewares/validate.middleware";
import { menuDataSchema } from "./menu.validation";

const route = Router();
// create menu
route.post(
  "/menu",
  validate({
    body: menuDataSchema,
  }),
  menuController.createMenu,
);
// get menu by id
// route.get("/menu/:id", menuController.getMenuById);

// delete some item in menu
// route.delete("/menu/:id", menuController.deleteMenuItem);
