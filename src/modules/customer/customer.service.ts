import { StatusCodes } from "http-status-codes";
import { AppError } from "../../middlewares/error.middleware";
import { customerRepository } from "./customer.repository";

class CustomerService {
  async findById(id: string) {
    return customerRepository.findById(id);
  }

  async findByUserId(userId: string) {
    return customerRepository.findByUserId(userId);
  }

  /**
   * Resolves the Customer id for an authenticated user. Throws 403 if the
   * account has no customer profile (e.g. an ADMIN account) — used by the
   * customer-scoped cart/order flows.
   */
  async requireCustomerIdByUserId(userId: string): Promise<string> {
    const customer = await customerRepository.findByUserId(userId);
    if (!customer) {
      throw new AppError(
        "This account has no customer profile",
        StatusCodes.FORBIDDEN,
      );
    }
    return customer.id;
  }
}

export const customerService = new CustomerService();
