import type {
  RestaurantModel,
  RestaurantDetailsModel,
} from "../../generated/prisma/models";
import { AppError } from "../../middlewares/error.middleware";
import { catalogErrors } from "../../shared/exceptions/catalog.errors";
import { cache, cacheKeys } from "../../shared/cache/cache";
import { menuService } from "../menu/menu.service";
// Imported as repositories (not services) to avoid a circular dependency:
// menu.service already imports restaurant.repository.
import { menuRepository } from "../menu/menu.repository";
import { menuItemRepository } from "../menuItem/menuItem.repository";
import { restaurantRepository } from "./restaurant.repository";
import type {
  CreateRestaurantInput,
  RestaurantDetailedResponse,
  RestaurantQuery,
  RestaurantResponse,
  UpdateRestaurantInput,
} from "./restaurant.validation";
import type { MenuResponse } from "../menu/menu.validation";

class RestaurantService {
  /**
   * `includeDeleted` is the admin's window onto soft-deleted rows — without it
   * there would be no way to find the id of something to restore. The caller
   * decides whether the requester is allowed to ask (see the controller).
   */
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
    // An admin listing deleted menus has to be able to reach them through a
    // deleted restaurant too — the cascade put them there together.
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

  // ─── Admin management (CRUD) ──────────────────────────
  /**
   * One transaction for both rows. A restaurant that exists while its details
   * insert failed is a half-registered restaurant nobody asked for — and the
   * admin who sent one request would have no way to tell which half landed.
   */
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
      // `updatedBy` is stamped even when only the details changed: from the
      // catalog's point of view this restaurant was touched, and the auditing
      // column exists to answer "by whom" for exactly that.
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

  /**
   * Soft delete, cascading down to menus and items — the same reach the old
   * `onDelete: Cascade` had, just expressed as a flag. Without the cascade a
   * deleted restaurant's items would keep surfacing in the catalog-wide search.
   *
   * One transaction, so the restaurant is never flagged while its catalog
   * isn't. Menu caches are dropped afterwards for the same reason a hard
   * delete had to: a cached menu blob outlives the row it came from.
   */
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

  /**
   * Undoes `remove`, cascading the same way. Note the asymmetry worth knowing
   * about: an item deleted on its own *before* the restaurant was deleted comes
   * back too, because the flag doesn't record which delete set it.
   */
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
    // Re-read rather than reconstruct: the restored row now has details to
    // report, and this endpoint documents the same shape as the other reads.
    return this.getByIdOrThrow(id);
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

  /**
   * `createdBy` / `updatedBy` stay out of the response on purpose: these
   * endpoints are public, and the columns hold internal admin user ids. The
   * audit trail is read through the menu history (ADMIN-only), not here.
   */
  private toRestaurantResponse(r: RestaurantModel): RestaurantResponse {
    return {
      id: r.id,
      name: r.name,
      isDeleted: r.isDeleted,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  /**
   * The single-restaurant shape. `details` is null when the restaurant has
   * none — which is a real state, not a placeholder: registration does not
   * require them and every restaurant that predates the table has none.
   *
   * The details row's own `id` and timestamps are left out. They belong to a
   * one-to-one row the caller can neither address nor update on its own, so
   * exposing them would only invite someone to try.
   */
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
