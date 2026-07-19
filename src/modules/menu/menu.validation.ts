import z from "zod";
import { schemaRegistry } from "../../openapi/registry";

export const menuDataSchema = z
  .object({
    restrauntid: z.string().cuid(),
    items: z.array(
      z.object({
        id: z.string().cuid().optional(),
        name: z.string().max(100),
        price: z.number().positive(),
        menuId: z.string().cuid().optional(),
      }),
    ),
    createdAt: z.date(),
  })
  .meta({ id: "MenuData", description: "Payload to create a menu" });

schemaRegistry.register("MenuData", menuDataSchema);

export type MenuData = z.infer<typeof menuDataSchema>;
