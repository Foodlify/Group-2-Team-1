import { appError } from "../../middlewares/error.middleware";
import {
  isUniqueViolation,
  uniqueViolationIncludes,
} from "../../shared/exceptions/prisma.errors";
import { userErrors } from "../../shared/exceptions/user.errors";
import {
  comparePassword,
  hashPassword,
} from "../../shared/auth/password.helper";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  REFRESH_TOKEN_TTL_MS,
} from "../../shared/auth/jwt.helper";
import { otpErrors } from "../../shared/exceptions/otp.errors";
import type { GoogleProfile } from "../../shared/auth/google.client";
import { customerService } from "../customer/customer.service";
import { otpService } from "../otp/otp.service";
import { userRepository } from "./user.repository";
import { refreshTokenRepository } from "./refreshToken.repository";
import type { UserModel } from "../../generated/prisma/models";
import type {
  AdminLoginInput,
  CreateUserInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateUserInput,
  UserQuery,
  UserResponse,
  VerifyEmailInput,
} from "./user.validation";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthResult {
  user: UserResponse;
  tokens: AuthTokens;
}

class UserService {
  async register(input: RegisterInput): Promise<{ user: UserResponse }> {
    if (await userRepository.findByEmail(input.email)) {
      throw appError(userErrors.EMAIL_ALREADY_EXISTS);
    }
    if (await userRepository.phoneExists(input.phone)) {
      throw appError(userErrors.PHONE_ALREADY_EXISTS);
    }

    const password = await hashPassword(input.password);

    let user: UserModel;
    try {
      user = await userRepository.createCustomerUser({
        name: input.name,
        email: input.email,
        password,
        phone: input.phone,
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw uniqueViolationIncludes(e, "phone")
          ? appError(userErrors.PHONE_ALREADY_EXISTS)
          : appError(userErrors.EMAIL_ALREADY_EXISTS);
      }
      throw e;
    }

    await otpService.sendOtp(user.email, "registration");
    return { user: this.toUserResponse(user) };
  }

  async verifyEmail(input: VerifyEmailInput): Promise<AuthResult> {
    const existing = await userRepository.findByEmail(input.email);
    if (!existing) throw appError(otpErrors.INVALID_OTP);
    if (existing.emailVerifiedAt) {
      throw appError(userErrors.EMAIL_ALREADY_VERIFIED);
    }

    await otpService.verifyOtp(input.email, input.code, "registration");
    const user = await userRepository.markEmailVerified(existing.id);

    const tokens = await this.issueTokens(user);
    return { user: this.toUserResponse(user), tokens };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await userRepository.findByEmail(input.email);
    if (!user || !(await comparePassword(input.password, user.password))) {
      throw appError(userErrors.INVALID_CREDENTIALS);
    }

    this.assertUsable(user);
    const tokens = await this.issueTokens(user);
    return { user: this.toUserResponse(user), tokens };
  }

  async loginWithGoogle(profile: GoogleProfile): Promise<AuthResult> {
    if (!profile.emailVerified) {
      throw appError(userErrors.GOOGLE_EMAIL_UNVERIFIED);
    }

    const existingByGoogleId = await userRepository.findByGoogleId(
      profile.googleId,
    );
    if (existingByGoogleId) {
      this.assertUsable(existingByGoogleId);
      return this.authResult(existingByGoogleId);
    }

    const existingByEmail = await userRepository.findByEmail(profile.email);
    if (existingByEmail) {
      this.assertUsable(existingByEmail);
      const linked = await userRepository.linkGoogleId(
        existingByEmail.id,
        profile.googleId,
      );
      return this.authResult(linked);
    }

    const created = await userRepository.createGoogleCustomerUser({
      name: profile.name,
      email: profile.email,
      googleId: profile.googleId,
    });
    return this.authResult(created);
  }

  private async authResult(user: UserModel): Promise<AuthResult> {
    const tokens = await this.issueTokens(user);
    return { user: this.toUserResponse(user), tokens };
  }

  async adminLogin(input: AdminLoginInput): Promise<AuthResult> {
    const user = await userRepository.findByEmail(input.email);
    if (
      !user ||
      user.role !== "ADMIN" ||
      !(await comparePassword(input.password, user.password))
    ) {
      throw appError(userErrors.INVALID_CREDENTIALS);
    }
    this.assertUsable(user);
    const tokens = await this.issueTokens(user);
    return { user: this.toUserResponse(user), tokens };
  }

  async setActive(id: string, isActive: boolean): Promise<UserResponse> {
    await this.assertExists(id);
    const user = await userRepository.setActive(id, isActive);
    if (!isActive) await refreshTokenRepository.revokeAllForUser(id);
    return this.toUserResponse(user);
  }

  async deactivateSelf(id: string): Promise<void> {
    await this.assertExists(id);
    await userRepository.setActive(id, false);
    await refreshTokenRepository.revokeAllForUser(id);
  }

  async refresh(refreshToken: string | undefined): Promise<AuthResult> {
    if (!refreshToken) throw appError(userErrors.INVALID_REFRESH_TOKEN);

    let payload: { id: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw appError(userErrors.INVALID_REFRESH_TOKEN);
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await refreshTokenRepository.findByTokenHash(tokenHash);
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw appError(userErrors.INVALID_REFRESH_TOKEN);
    }

    const user = await userRepository.findById(payload.id);
    if (!user || stored.userId !== user.id) {
      throw appError(userErrors.INVALID_REFRESH_TOKEN);
    }

    this.assertUsable(user);

    await refreshTokenRepository.revokeByTokenHash(tokenHash);
    const tokens = await this.issueTokens(user);
    return { user: this.toUserResponse(user), tokens };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      verifyRefreshToken(refreshToken);
    } catch {
      return;
    }

    await refreshTokenRepository.revokeByTokenHash(hashToken(refreshToken));
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);
    if (!user) return;
    await otpService.sendOtp(email, "password_reset");
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    await otpService.verifyOtp(input.email, input.code, "password_reset");
    const user = await userRepository.findByEmail(input.email);

    if (!user) throw appError(otpErrors.INVALID_OTP);

    await userRepository.update({
      where: { id: user.id },
      data: { password: await hashPassword(input.newPassword) },
    });
    await refreshTokenRepository.revokeAllForUser(user.id);
  }

  async create(input: CreateUserInput): Promise<UserResponse> {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) throw appError(userErrors.EMAIL_ALREADY_EXISTS);

    const password = await hashPassword(input.password);

    if (input.role === "CUSTOMER") {
      if (!input.phone) throw appError(userErrors.PHONE_REQUIRED);
      if (await userRepository.phoneExists(input.phone)) {
        throw appError(userErrors.PHONE_ALREADY_EXISTS);
      }
      try {
        const user = await userRepository.createCustomerUser({
          name: input.name,
          email: input.email,
          password,
          phone: input.phone,
        });
        return this.toUserResponse(user);
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw uniqueViolationIncludes(e, "phone")
            ? appError(userErrors.PHONE_ALREADY_EXISTS)
            : appError(userErrors.EMAIL_ALREADY_EXISTS);
        }
        throw e;
      }
    }

    const user = await userRepository.create({
      data: {
        name: input.name,
        email: input.email,
        password,
        role: input.role,
      },
    });
    return this.toUserResponse(user);
  }

  async list(query: UserQuery): Promise<{
    data: UserResponse[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const result = await userRepository.listPaginated(query.page, query.limit);
    return {
      data: result.data.map((u) => this.toUserResponse(u)),
      meta: result.meta,
    };
  }

  async findById(id: string): Promise<UserResponse> {
    const user = await this.assertExists(id);
    return this.toUserResponse(user);
  }

  async update(id: string, input: UpdateUserInput): Promise<UserResponse> {
    await this.assertExists(id);

    if (input.role === "CUSTOMER") {
      const customer = await customerService.findByUserId(id);
      if (!customer) throw appError(userErrors.CUSTOMER_PROFILE_REQUIRED);
    }
    try {
      const user = await userRepository.update({ where: { id }, data: input });
      return this.toUserResponse(user);
    } catch (e) {
      if (isUniqueViolation(e)) throw appError(userErrors.EMAIL_ALREADY_EXISTS);
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    await userRepository.delete({ where: { id } });
  }

  private async assertExists(id: string): Promise<UserModel> {
    const user = await userRepository.findById(id);
    if (!user) throw appError(userErrors.USER_NOT_FOUND);
    return user;
  }

  private assertUsable(user: UserModel): void {
    if (!user.isActive) throw appError(userErrors.ACCOUNT_DISABLED);
    if (!user.emailVerifiedAt) throw appError(userErrors.EMAIL_NOT_VERIFIED);
  }

  private async issueTokens(user: UserModel): Promise<AuthTokens> {
    const accessToken = signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = signRefreshToken({ id: user.id });

    await refreshTokenRepository.deleteInactiveForUser(user.id);
    await refreshTokenRepository.createForUser(
      user.id,
      hashToken(refreshToken),
      new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    );
    return { accessToken, refreshToken };
  }

  private toUserResponse(user: UserModel): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}

export const userService = new UserService();
