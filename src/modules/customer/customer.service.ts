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
}

export const customerService = new CustomerService();
