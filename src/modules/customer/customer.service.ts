import { customerRepository } from "./customer.repository";

class CustomerService {
  async findById(id: string) {
    return customerRepository.findById(id);
  }
}

export const customerService = new CustomerService();
