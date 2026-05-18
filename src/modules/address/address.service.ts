import { addressRepository } from "./address.repository";

class AddressService {
  async findById(id: string) {
    return addressRepository.findById(id);
  }
}

export const addressService = new AddressService();
