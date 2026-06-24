import { BaseRepository } from "../../shared/repositories/base.repository";
import prisma from "../../config/prisma";

class OtpRepository extends BaseRepository<(typeof prisma)["otp"]> {
  constructor() {
    super(prisma.otp);
  }
}

export const otpRepository = new OtpRepository();
