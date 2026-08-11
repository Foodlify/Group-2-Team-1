import type {
  RestaurantModel,
  RestaurantDetailsModel,
} from "../../generated/prisma/models";
import { AppError } from "../../middlewares/error.middleware";
import { catalogErrors } from "../../shared/exceptions/catalog.errors";
import { userErrors } from "../../shared/exceptions/user.errors";
import { userRepository } from "../user/user.repository";
import { cache, cacheKeys } from "../../shared/cache/cache";
import { menuService } from "../menu/menu.service";

import { menuRepository } from "../menu/menu.repository";
import { menuItemRepository } from "../menuItem/menuItem.repository";
import { restaurantRepository } from "./restaurant.repository";
import type {
  CreateRestaurantInput,
  RestaurantDetailedResponse,
  RestaurantOwnerResponse,
  RestaurantQuery,
  RestaurantResponse,
  UpdateRestaurantInput,
} from "./restaurant.validation";
import type { MenuResponse } from "../menu/menu.validation";

class RestaurantService {
  async list(
    query: RestaurantQuery,
    includeDeleted = false,
  ): Promise<{
    data: RestaurantResponse[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const result = await restaurantRepository.listPaginated(
      query.page,
      query.limit,
      query.search,
      includeDeleted,
    );
    return {
      data: result.data.map((r) => this.toRestaurantResponse(r)),
      meta: result.meta,
    };
  }

  async getByIdOrThrow(id: string): Promise<RestaurantDetailedResponse> {
    const restaurant = await restaurantRepository.findByIdWithDetails(id);
    if (!restaurant) {
      throw new AppError(
        catalogErrors.RESTAURANT_NOT_FOUND.message,
        catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
      );
    }
    return this.toDetailedResponse(restaurant, restaurant.details);
  }

  async getMenus(
    restaurantId: string,
    includeDeleted = false,
  ): Promise<MenuResponse[]> {
    const restaurant = includeDeleted
      ? await restaurantRepository.findByIdIncludingDeleted(restaurantId)
      : await restaurantRepository.findById(restaurantId);
    if (!restaurant) {
      throw new AppError(
        catalogErrors.RESTAURANT_NOT_FOUND.message,
        catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
      );
    }
    return menuService.listByRestaurant(restaurantId, includeDeleted);
  }

  async create(
    input: CreateRestaurantInput,
    actorId: string,
  ): Promise<RestaurantDetailedResponse> {
    return restaurantRepository.transaction(async (tx) => {
      const restaurant = await restaurantRepository.createRestaurant(
        { name: input.name, createdBy: actorId, updatedBy: actorId },
        tx,
      );
      const details = input.details
        ? await restaurantRepository.upsertDetails(
            restaurant.id,
            input.details,
            tx,
          )
        : null;
      return this.toDetailedResponse(restaurant, details);
    });
  }

  async update(
    id: string,
    input: UpdateRestaurantInput,
    actorId: string,
  ): Promise<RestaurantDetailedResponse> {
    const existing = await restaurantRepository.findByIdWithDetails(id);
    if (!existing) {
      throw new AppError(
        catalogErrors.RESTAURANT_NOT_FOUND.message,
        catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
      );
    }

    return restaurantRepository.transaction(async (tx) => {
      const restaurant = await restaurantRepository.updateById(
        id,
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          updatedBy: actorId,
        },
        tx,
      );
      const details = input.details
        ? await restaurantRepository.upsertDetails(id, input.details, tx)
        : existing.details;
      return this.toDetailedResponse(restaurant, details);
    });
  }

  async remove(id: string, actorId: string): Promise<void> {
    await this.assertExists(id);
    const menuIds = await restaurantRepository.transaction(async (tx) => {
      const ids = await menuRepository.findIdsByRestaurantId(id, tx);
      await menuItemRepository.softDeleteByMenuIds(ids, actorId, tx);
      await menuRepository.softDeleteByRestaurantId(id, actorId, tx);
      await restaurantRepository.softDeleteById(id, actorId, tx);
      return ids;
    });
    await this.invalidateMenus(menuIds);
  }

  async restore(
    id: string,
    actorId: string,
  ): Promise<RestaurantDetailedResponse> {
    const restaurant = await restaurantRepository.findByIdIncludingDeleted(id);
    if (!restaurant) {
      throw new AppError(
        catalogErrors.RESTAURANT_NOT_FOUND.message,
        catalogErrors.RESTAURANT_NOT_FOUND.statusCode,
      );
    }
    if (!restaurant.isDeleted) {
      throw new AppError(
        catalogErrors.NOT_DELETED.message,
        catalogErrors.NOT_DELETED.statusCode,
      );
    }
    const menuIds = await restaurantRepository.transaction(async (tx) => {
      const ids = await menuRepository.findIdsByRestaurantId(id, tx);
      await menuItemRepository.restoreByMenuIds(ids, actorId, tx);
      await menuRepository.restoreByRestaurantId(id, actorId, tx);
      await restaurantRepository.restoreById(id, actorId, tx);
      return ids;
    });
    await this.invalidateMenus(menuIds);

    return this.getByIdOrThrow(id);
  }

  async assignOwner(
    restaurantId: string,
    ownerId: string | null,
    actorId: string,
  ): Promise<RestaurantOwnerResponse> {
    await this.assertExists(restaurantId);

    if (ownerId !== null) {
      const owner = await userRepository.findById(ownerId);
      if (!owner) {
        throw new AppError(
          userErrors.USER_NOT_FOUND.message,
          userErrors.USER_NOT_FOUND.statusCode,
        );
      }
      if (owner.role !== "RESTAURANT") {
        throw new AppError(
          catalogErrors.OWNER_ROLE_REQUIRED.message,
          catalogErrors.OWNER_ROLE_REQUIRED.statusCode,
        );
      }
    }

    const updated = await restaurantRepository.setOwner(
      restaurantId,
      ownerId,
      actorId,
    );
    return { restaurantId: updated.id, ownerId: updated.ownerId };
  }

  private async invalidateMenus(menuIds: string[]): Promise<void> {
    if (menuIds.length === 0) return;
    await cache.del(...menuIds.map((menuId) => cacheKeys.menu(menuId)));
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
      isDeleted: r.isDeleted,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  private toDetailedResponse(
    r: RestaurantModel,
    details: RestaurantDetailsModel | null,
  ): RestaurantDetailedResponse {
    return {
      ...this.toRestaurantResponse(r),
      details: details
        ? {
            phone: details.phone,
            email: details.email,
            description: details.description,
            addressLine1: details.addressLine1,
            addressLine2: details.addressLine2,
            city: details.city,
            postalCode: details.postalCode,
            country: details.country,
          }
        : null,
    };
  }
}

export const restaurantService = new RestaurantService();
