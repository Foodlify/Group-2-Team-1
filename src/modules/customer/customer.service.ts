import { AppError } from "../../middlewares/error.middleware";
import { customerRepository } from "./customer.repository";

export class CustomerService {
  async getMyProfileService(customerId: string) {
    const customer = await customerRepository.findById(customerId);
    if (!customer) {
      throw new AppError("Customer not found", 404);
    }
    return customer;
  }

  async getCustomerOrdersService(customerId: string) {
    const customer = await customerRepository.findByIdWithOrders(customerId);
    if (!customer) {
      throw new AppError("Customer not found", 404);
    }
    return customer.orders;
  }

  async getCustomerOrdersHistoryService(customerId: string) {
    const customer =
      await customerRepository.findCustomerOrderHistory(customerId);
    if (!customer) {
      throw new AppError("Customer not found", 404);
    }

    const orders = customer.orders.map((item) => ({
      ...item,
      totalPrice: item.items.reduce(
        (sum, item) => sum + item.quantity * item.menuItem.price,
        0,
      ),
    }));
    return orders;
  }
}

export const customerService = new CustomerService();
