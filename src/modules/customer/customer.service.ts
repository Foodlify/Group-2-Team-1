import { AppError } from "../../middlewares/error.middleware";
import { addressRepository } from "../address/address.repository";
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

  async updateMyProfileService(
    customerId: string,
    data: { name?: string; email?: string },
  ) {
    const customer = await customerRepository.findById(customerId);
    if (!customer) {
      throw new AppError("Customer not found", 404);
    }

    const userData: Record<string, string> = {};
    if (data.name) userData.name = data.name;
    if (data.email) userData.email = data.email;

    if (Object.keys(userData).length === 0) {
      return customer;
    }

    const updated = await customerRepository.update({
      where: { id: customerId },
      data: {
        user: { update: userData },
      },
      include: { user: true },
    });

    return updated;
  }

  async updateCustomerAddressService(
    customerId: string,
    addressId: string,
    body: Record<string, string | undefined>,
  ) {
    const customer = await customerRepository.findById(customerId);
    if (!customer) {
      throw new AppError("Customer not found", 404);
    }

    const address = await addressRepository.findById(addressId);
    if (!address) {
      throw new AppError("Address not found", 404);
    }

    if (address.userId !== customer.userId) {
      throw new AppError("Address does not belong to this customer", 403);
    }

    const allowedFields = [
      "addressLine1",
      "addressLine2",
      "city",
      "postalCode",
      "country",
    ] as const;
    const data: Record<string, string> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        data[field] = body[field] as string;
      }
    }

    if (Object.keys(data).length === 0) {
      return address;
    }

    const updated = await addressRepository.update({
      where: { id: addressId },
      data,
    });

    return updated;
  }
}

export const customerService = new CustomerService();
