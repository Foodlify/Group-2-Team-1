import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class UserRoleRepository extends BaseRepository<PrismaClient["userRole"]> {
  constructor() {
    super(prisma.userRole);
  }

  /**
   * Convenience method — find by composite primary key.
   * Entity-specific query methods should be added here as the application grows.
   */
  async findByComposite(userId: string, roleId: string) {
    return this.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
  }
}

export const userRoleRepository = new UserRoleRepository();
