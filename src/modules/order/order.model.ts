import type {
  OrderModel,
  OrderItemModel,
  MenuItemModel,
  AddressModel,
} from "../../generated/prisma/models";

export type OrderWithItems = OrderModel & {
  items: Array<OrderItemModel & {
    menuItem: MenuItemModel;
  }>;
  address: AddressModel;
};

export type OrderWithFullDetails = OrderModel & {
  items: Array<OrderItemModel & {
    menuItem: MenuItemModel;
  }>;
  address: AddressModel;
  status: {
    status: string;
  } | null;
};
