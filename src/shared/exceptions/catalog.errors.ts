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

  RESOURCE_IN_USE: {
    message:
      "Cannot delete: this resource is still referenced by existing carts or orders",
    statusCode: 409,
  },

  NOT_DELETED: {
    message: "Cannot restore: this resource is not deleted",
    statusCode: 409,
  },

  PARENT_DELETED: {
    message: "Cannot restore: the parent menu is deleted — restore it first",
    statusCode: 409,
  },

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
