import type { PrismaClient } from "../../generated/prisma/client";
import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

export class OtpRepository extends BaseRepository<PrismaClient["otp"]> {
  constructor() {
    super(prisma.otp);
  }

  async countRecent(email: string, purpose: string, since: Date) {
    return this.count({ where: { email, purpose, createdAt: { gte: since } } });
  }

  async deleteUnused(email: string, purpose: string): Promise<void> {
    await prisma.otp.deleteMany({ where: { email, purpose, used: false } });
  }

  async findLatestValid(email: string, purpose: string) {
    return this.findFirst({
      where: { email, purpose, used: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  }

  async markUsed(id: string): Promise<void> {
    await this.update({ where: { id }, data: { used: true } });
  }
}

export const otpRepository = new OtpRepository();
