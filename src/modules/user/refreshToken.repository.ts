import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class RefreshTokenRepository extends BaseRepository<
  PrismaClient["refreshToken"]
> {
  constructor() {
    super(prisma.refreshToken);
  }

  async createForUser(userId: string, tokenHash: string, expiresAt: Date) {
    return this.create({ data: { userId, tokenHash, expiresAt } });
  }

  async findByTokenHash(tokenHash: string) {
    return this.findUnique({ where: { tokenHash } });
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  async deleteInactiveForUser(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: {
        userId,
        OR: [{ expiresAt: { lt: new Date() } }, { revoked: true }],
      },
    });
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
