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
        roles: { include: { role: true } },
      },
    });

    if (!user) {
      throw new AppError("Invalid email or password", 401);
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new AppError("Invalid email or password", 401);
    }

    const role = user.roles[0]?.role.name || "user";
    const accessToken = this.generateAccessToken(user.id, user.email, role);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role,
      },
    };
  }

  async register(
    name: string,
    email: string,
    password: string,
    role?: string | undefined,
  ) {
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new AppError("Email already in use", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    
    const userTypeName = role === "Admin" ? "Admin" : "Customer";

    const userType = await prisma.userType.upsert({
      where: { name: userTypeName },
      update: {},
      create: { name: userTypeName },
    });

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        typeId: userType.id,
        ...(userTypeName === "Customer" ? { customer: { create: {} } } : {}),
      },
    });

    const jwtRole = role || userTypeName;

    const accessToken = this.generateAccessToken(
      newUser.id,
      newUser.email,
      jwtRole,
    );
    const refreshToken = await this.generateRefreshToken(newUser.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: jwtRole,
      },
    };
  }

  async logout(refreshTokenStr: string) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshTokenStr, revoked: false },
      data: { revoked: true },
    });
  }

  async refresh(refreshTokenStr: string) {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshTokenStr },
      include: {
        user: {
          include: { roles: { include: { role: true } } },
        },
      },
    });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new AppError("Invalid or expired refresh token", 401);
    }

    // Revoke the old token (rotation)
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    // Create a new refresh token
    const newRefreshToken = await this.generateRefreshToken(stored.userId);

    const role = stored.user.roles[0]?.role.name || "user";
    const accessToken = this.generateAccessToken(
      stored.user.id,
      stored.user.email,
      role,
    );

    return { accessToken, refreshToken: newRefreshToken };
  }

  private generateAccessToken(
    userId: string,
    email: string,
    role?: string,
  ): string {
    return jwt.sign({ id: userId, email, role }, env.JWT_SECRET, {
      expiresIn: "15m",
    });
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(40).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });

    return token;
  }
}

export const authService = new AuthService();
