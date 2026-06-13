import type { RestaurantModel } from "../../generated/prisma/models";
import { AppError } from "../../middlewares/error.middleware";
import { catalogErrors } from "../../shared/exceptions/catalog.errors";
import { isForeignKeyViolation } from "../../shared/exceptions/prisma.errors";
import { menuService } from "../menu/menu.service";
import { restaurantRepository } from "./restaurant.repository";
import type {
  CreateRestaurantInput,
  RestaurantQuery,
  RestaurantResponse,
  UpdateRestaurantInput,
} from "./restaurant.validation";
import type { MenuResponse } from "../menu/menu.validation";

class RestaurantService {
  async list(query: RestaurantQuery): Promise<{
    data: RestaurantResponse[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const result = await restaurantRepository.listPaginated(
      query.page,
      query.limit,
      query.search,
    );
    return {
      data: result.data.map((r) => this.toRestaurantResponse(r)),
      meta: result.meta,
    };
  }

  async getByIdOrThrow(id: string): Promise<RestaurantResponse> {
    const restaurant = await this.assertExists(id);
    return this.toRestaurantResponse(restaurant);
  }

  async getMenus(restaurantId: string): Promise<MenuResponse[]> {
    await this.assertExists(restaurantId);
    return menuService.listByRestaurant(restaurantId);
  }

  // ─── Admin management (CRUD) ──────────────────────────
  async create(input: CreateRestaurantInput): Promise<RestaurantResponse> {
    const restaurant = await restaurantRepository.create({
      data: { name: input.name },
    });
    return this.toRestaurantResponse(restaurant);
  }

  async update(
    id: string,
    input: UpdateRestaurantInput,
  ): Promise<RestaurantResponse> {
    await this.assertExists(id);
    const restaurant = await restaurantRepository.update({
      where: { id },
      data: input,
    });
    return this.toRestaurantResponse(restaurant);
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    try {
      await restaurantRepository.delete({ where: { id } });
    } catch (e) {
      // Orders reference the restaurant via `onDelete: Restrict`.
      if (isForeignKeyViolation(e)) {
        throw new AppError(
          catalogErrors.RESOURCE_IN_USE.message,
          catalogErrors.RESOURCE_IN_USE.statusCode,
        );
      }
      throw e;
    }
  }

  private async assertExists(id: string): Promise<RestaurantModel> {
    const restaurant = await restaurantRepository.findById(id);
    if (!restaurant) {
      throw new AppError(
        catalogErrors.RESTAURANT_NOT_FOUND.message,
        catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
      );
    }
    return restaurant;
  }

  private toRestaurantResponse(r: RestaurantModel): RestaurantResponse {
    return {
      id: r.id,
      name: r.name,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}

export const restaurantService = new RestaurantService();
