export const catalogErrors = {
  RESTAURANT_NOT_FOUND: {
    message: "Restaurant not found",
    statusCode: 404,
  },
  MENU_NOT_FOUND: {
    message: "Menu not found",
    statusCode: 404,
  },
  MENU_ITEM_NOT_FOUND: {
    message: "Menu item not found",
    statusCode: 404,
  },
  // Raised when a delete is blocked by an `onDelete: Restrict` relation —
  // e.g. a menu item still referenced by existing carts or orders.
  RESOURCE_IN_USE: {
    message:
      "Cannot delete: this resource is still referenced by existing carts or orders",
    statusCode: 409,
  },
  // Restore only makes sense for a row that is currently soft-deleted.
  NOT_DELETED: {
    message: "Cannot restore: this resource is not deleted",
    statusCode: 409,
  },
  // Restoring a child into a deleted parent would leave it invisible anyway.
  PARENT_DELETED: {
    message: "Cannot restore: the parent menu is deleted — restore it first",
    statusCode: 409,
  },
  PARENT_RESTAURANT_DELETED: {
    message:
      "Cannot restore: the parent restaurant is deleted — restore it first",
    statusCode: 409,
  },
} as const;
