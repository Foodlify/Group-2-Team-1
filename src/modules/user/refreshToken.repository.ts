import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

/**
 * Persistence for issued refresh tokens (one row per session/device).
 * Ported from Kamal's `customer-management` RefreshToken design, adapted to
 * store the SHA-256 hash (never the raw token) and to keep the JWT-based
 * refresh flow of this branch.
 */
export class RefreshTokenRepository extends BaseRepository<
  PrismaClient["refreshToken"]
> {
  constructor() {
    super(prisma.refreshToken);
  }

  async createForUser(userId: string, tokenHash: string, expiresAt: Date) {
    return this.create({ data: { userId, tokenHash, expiresAt } });
  }

  /** The row for a presented token — caller checks `revoked`/`expiresAt`. */
  async findByTokenHash(tokenHash: string) {
    return this.findUnique({ where: { tokenHash } });
  }

  /** Revokes a single session. No-op when the hash is unknown. */
  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revoked: false },
      data: { revoked: true },
    });
  }

  /**
   * Revokes EVERY active session for a user — used after a password reset so
   * a stolen refresh token dies with the old password.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  /**
   * Housekeeping: drops rows that can never authenticate again (expired or
   * revoked). Called opportunistically on login so the table doesn't grow
   * unbounded — no cron needed at this scale.
   */
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
