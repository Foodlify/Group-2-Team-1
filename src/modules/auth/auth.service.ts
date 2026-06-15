import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../../config/prisma";
import env from "../../config/env";
import { AppError } from "../../middlewares/error.middleware";
import crypto from "crypto";

class AuthService {
  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        password,
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    console.log("user", user);
    const notValid = new AppError("email or pass not correct", 401);
    if (!user) {
      throw notValid;
    }
    // encode the password
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw notValid;
    }
    const userId = user.id;
    const role = user?.roles[0]?.role.name;

    const token = this.generateAccessToken(userId, email, role);
    const refreshToken = await this.generateRefreshToken(userId);
    return {
      user,
      token,
      refreshToken,
    };
  }
  // async register(name: string, email: string, password: string) {
  //   const existing = await prisma.user.findUnique({
  //     where: { email },
  //   });

  //   if (existing) {
  //     throw new AppError("Email already in use", 409);
  //   }

  //   const hashedPassword = await bcrypt.hash(password, 12);

  //   const user = await prisma.user.create({
  //     data: {
  //       name,
  //       email,
  //       password: hashedPassword,
  //       typeId:
  //         (await prisma.userType.findFirst({ where: { name: "Customer" } }))
  //           ?.id || "",
  //       customer: { create: {} },
  //     },
  //     include: { customer: true },
  //   });

  //   const role = "user";
  //   const accessToken = this.generateAccessToken(user.id, user.email, role);
  //   const refreshToken = await this.generateRefreshToken(user.id);

  //   return {
  //     accessToken,
  //     refreshToken,
  //     user: {
  //       id: user.id,
  //       name: user.name,
  //       email: user.email,
  //       role,
  //     },
  //   };
  // }

  async register(name: string, email: string, password: string) {
    //    name      String
    // email     String @unique
    // password  String
    // userType          UserType                  @relation(fields: [typeId], references: [id], onDelete: Restrict)
    // roles             UserRole[]
    // customer          Customer?
    // addresses         Address[]

    //admin, customer, user..
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        password,
        roles: {
          include: {
            role: true,
          },
        },
      },
    });
    if (!user) {
      throw new AppError("err", 401);
    }
    // should put this data in the db
    // call the db of register
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password,
        typeId:
          (
            await prisma.userType.findFirst({
              // get the id of customer
              // customer
              // rest owner // admin, manager,
              where: {
                name: "customer",
              },
            })
          )?.id || "",
      },
    });
    // should extracted from JWT
    const role = "user";
    const accessToken = this.generateAccessToken(user.id, user.email, role);
    const refreshToken = await this.generateRefreshToken(user.id);
    return {
      newUser,
      accessToken,
      refreshToken,
    };
  }
  async refresh(refreshTokenStr: string) {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshTokenStr },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new AppError("Invalid or expired refresh token", 401);
    }

    const role = stored.user.roles[0]?.role.name || "user";
    const accessToken = this.generateAccessToken(
      stored.user.id,
      stored.user.email,
      role,
    );

    return { accessToken };
  }

  async logout(refreshTokenStr: string) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshTokenStr, revoked: false },
      data: { revoked: true },
    });
  }

  private generateAccessToken(
    userId: string,
    email: string,
    role: string,
  ): string {
    return jwt.sign({ id: userId, email, role }, env.JWT_SECRET, {
      expiresIn: "15m",
    });
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(40).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });

    return token;
  }
}

export const authService = new AuthService();
