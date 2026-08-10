import { appError } from "../../middlewares/error.middleware";
import { isUniqueViolation } from "../../shared/exceptions/prisma.errors";
import { customerErrors } from "../../shared/exceptions/customer.errors";
import { customerRepository } from "./customer.repository";
import type {
  CustomerResponse,
  UpdateCustomerInput,
} from "./customer.validation";

type CustomerDetails = NonNullable<
  Awaited<ReturnType<typeof customerRepository.findByUserIdWithDetails>>
>;

class CustomerService {
  async findById(id: string) {
    return customerRepository.findById(id);
  }

  async findByUserId(userId: string) {
    return customerRepository.findByUserId(userId);
  }

  async requireCustomerIdByUserId(userId: string): Promise<string> {
    const customer = await customerRepository.findByUserId(userId);
    if (!customer) throw appError(customerErrors.NOT_A_CUSTOMER);
    return customer.id;
  }

  async getMe(userId: string): Promise<CustomerResponse> {
    const customer = await customerRepository.findByUserIdWithDetails(userId);
    if (!customer) throw appError(customerErrors.NOT_A_CUSTOMER);
    return this.toCustomerResponse(customer);
  }

  async updateMe(
    userId: string,
    input: UpdateCustomerInput,
  ): Promise<CustomerResponse> {
    const customer = await customerRepository.findByUserId(userId);
    if (!customer) throw appError(customerErrors.NOT_A_CUSTOMER);

    try {
      await customerRepository.updateProfile({
        customerId: customer.id,
        userId,
        name: input.name,
        phone: input.phone,
      });
    } catch (e) {
      if (isUniqueViolation(e))
        throw appError(customerErrors.PHONE_ALREADY_EXISTS);
      throw e;
    }

    return this.getMe(userId);
  }

  private toCustomerResponse(c: CustomerDetails): CustomerResponse {
    return {
      id: c.id,
      userId: c.userId,
      user: { name: c.user.name, email: c.user.email },
      phone: c.phone,
      addressesCount: c._count.addresses,
      ordersCount: c._count.orders,
      hasCart: c.cart !== null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}

export const customerService = new CustomerService();
