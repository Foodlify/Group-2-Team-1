import { AppError } from "../../middlewares/error.middleware";
import { customerErrors } from "../../shared/exceptions/customer.errors";
import { customerRepository } from "./customer.repository";
import type { CustomerResponse, UpdateCustomerInput } from "./customer.validation";

type CustomerDetails = NonNullable<
  Awaited<ReturnType<typeof customerRepository.findByUserIdWithDetails>>
>;

const isUniqueViolation = (e: unknown): boolean =>
  typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

const appError = (def: { message: string; statusCode: number }): AppError =>
  new AppError(def.message, def.statusCode);

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
    if (!customer) throw appError(customerErrors.NOT_A_CUSTOMER);
    return customer.id;
  }

  // ─── Profile (me) ─────────────────────────────────────
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
      if (isUniqueViolation(e)) throw appError(customerErrors.PHONE_ALREADY_EXISTS);
      throw e;
    }

    return this.getMe(userId);
  }

  // ─── Private helpers ──────────────────────────────────
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
