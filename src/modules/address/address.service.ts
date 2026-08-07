import { AppError } from "../../middlewares/error.middleware";
import { customerErrors } from "../../shared/exceptions/customer.errors";
import { addressRepository } from "./address.repository";
import type { AddressModel } from "../../generated/prisma/models";
import type {
  AddressResponse,
  CreateAddressInput,
  UpdateAddressInput,
} from "../customer/customer.validation";

const appError = (def: { message: string; statusCode: number }): AppError =>
  new AppError(def.message, def.statusCode);

class AddressService {
  async findById(id: string) {
    return addressRepository.findById(id);
  }

  async listByCustomer(customerId: string): Promise<AddressResponse[]> {
    const addresses = await addressRepository.findByCustomerId(customerId);
    return addresses.map((a) => this.toAddressResponse(a));
  }

  async create(
    customerId: string,
    input: CreateAddressInput,
  ): Promise<AddressResponse> {
    // The customer's first address becomes the default automatically.
    const existing = await addressRepository.countByCustomerId(customerId);
    const address = await addressRepository.create({
      data: { ...input, customerId, isDefault: existing === 0 },
    });
    return this.toAddressResponse(address);
  }

  async setDefault(
    customerId: string,
    addressId: string,
  ): Promise<AddressResponse> {
    await this.assertOwned(addressId, customerId);
    const address = await addressRepository.setDefault(customerId, addressId);
    return this.toAddressResponse(address);
  }

  async update(
    customerId: string,
    addressId: string,
    input: UpdateAddressInput,
  ): Promise<AddressResponse> {
    await this.assertOwned(addressId, customerId);
    const address = await addressRepository.update({
      where: { id: addressId },
      data: input,
    });
    return this.toAddressResponse(address);
  }

  async remove(customerId: string, addressId: string): Promise<void> {
    const address = await this.assertOwned(addressId, customerId);
    await addressRepository.deleteAndReassignDefault(
      customerId,
      addressId,
      address.isDefault,
    );
  }

  // ─── Private helpers ──────────────────────────────────
  private async assertOwned(
    addressId: string,
    customerId: string,
  ): Promise<AddressModel> {
    const address = await addressRepository.findById(addressId);
    if (!address) throw appError(customerErrors.ADDRESS_NOT_FOUND);
    if (address.customerId !== customerId) {
      throw appError(customerErrors.ADDRESS_FORBIDDEN);
    }
    return address;
  }

  private toAddressResponse(a: AddressModel): AddressResponse {
    return {
      id: a.id,
      customerId: a.customerId,
      addressLine1: a.addressLine1,
      addressLine2: a.addressLine2,
      city: a.city,
      postalCode: a.postalCode,
      country: a.country,
      isDefault: a.isDefault,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    };
  }
}

export const addressService = new AddressService();
