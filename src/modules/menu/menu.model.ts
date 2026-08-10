export {
  MenuChangeAction,
  MenuChangeEntity,
} from "../../generated/prisma/enums";

export const MENU_CHANGE_ENTITIES = ["MENU", "MENU_ITEM"] as const;
export const MENU_CHANGE_ACTIONS = [
  "CREATED",
  "UPDATED",
  "DELETED",
  "RESTORED",
] as const;

export type MenuChangeEntityValue = (typeof MENU_CHANGE_ENTITIES)[number];
export type MenuChangeActionValue = (typeof MENU_CHANGE_ACTIONS)[number];
