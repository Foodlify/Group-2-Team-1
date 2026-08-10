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
  // Ownership is a grant of authority over real orders and real money, so it
  // is refused rather than quietly made meaningless: assigning it to a CUSTOMER
  // account would store a row that grants nothing, and the admin who did it
  // would have no way to tell.
  OWNER_ROLE_REQUIRED: {
    message:
      "The owner must be an account with the RESTAURANT role; change the account's role first",
    statusCode: 400,
  },
  PARENT_RESTAURANT_DELETED: {
    message:
      "Cannot restore: the parent restaurant is deleted — restore it first",
    statusCode: 409,
  },
} as const;
