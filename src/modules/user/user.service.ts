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
} from "../../shared/auth/jwt.helper";
import { customerService } from "../customer/customer.service";
import { userRepository } from "./user.repository";
import type { UserModel } from "../../generated/prisma/models";
import type {
  AdminLoginInput,
  CreateUserInput,
  LoginInput,
  RegisterInput,
  UpdateUserInput,
  UserQuery,
  UserResponse,
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
  // ─── Customer auth ────────────────────────────────────
  async register(input: RegisterInput): Promise<AuthResult> {
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
      // Fallback for a concurrent insert racing the pre-checks above.
      if (isUniqueViolation(e)) {
        throw uniqueViolationIncludes(e, "phone")
          ? appError(userErrors.PHONE_ALREADY_EXISTS)
          : appError(userErrors.EMAIL_ALREADY_EXISTS);
      }
      throw e;
    }

    const tokens = await this.issueTokens(user);
    return { user: this.toUserResponse(user), tokens };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await userRepository.findByEmail(input.email);
    if (!user || !(await comparePassword(input.password, user.password))) {
      throw appError(userErrors.INVALID_CREDENTIALS);
    }
    const tokens = await this.issueTokens(user);
    return { user: this.toUserResponse(user), tokens };
  }

  // ─── Admin auth ───────────────────────────────────────
  async adminLogin(input: AdminLoginInput): Promise<AuthResult> {
    const user = await userRepository.findByEmail(input.email);
    if (
      !user ||
      user.role !== "ADMIN" ||
      !(await comparePassword(input.password, user.password))
    ) {
      throw appError(userErrors.INVALID_CREDENTIALS);
    }
    const tokens = await this.issueTokens(user);
    return { user: this.toUserResponse(user), tokens };
  }

  // ─── Refresh / Logout ─────────────────────────────────
  async refresh(refreshToken: string | undefined): Promise<AuthResult> {
    if (!refreshToken) throw appError(userErrors.INVALID_REFRESH_TOKEN);

    let payload: { id: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw appError(userErrors.INVALID_REFRESH_TOKEN);
    }

    const user = await userRepository.findById(payload.id);
    // Stored value is a SHA-256 hash, so compare against the hash of the
    // presented token (never the raw token).
    if (!user || user.refreshToken !== hashToken(refreshToken)) {
      throw appError(userErrors.INVALID_REFRESH_TOKEN);
    }

    const tokens = await this.issueTokens(user); // rotates the refresh token
    return { user: this.toUserResponse(user), tokens };
  }

  /**
   * Revokes the session identified by the refresh cookie. Works even when the
   * access token has expired (logout no longer depends on `authenticate`).
   * Invalid/absent tokens are a no-op — the caller still clears the cookies.
   */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    let payload: { id: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return;
    }
    await userRepository.updateRefreshToken(payload.id, null);
  }

  // ─── Admin user management (CRUD) ─────────────────────
  async create(input: CreateUserInput): Promise<UserResponse> {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) throw appError(userErrors.EMAIL_ALREADY_EXISTS);

    const password = await hashPassword(input.password);

    // A CUSTOMER account is only usable with a matching Customer profile (cart/
    // order flows require it). Create both atomically so an admin can't mint a
    // half-provisioned customer that 403s everywhere. `phone` is mandatory here.
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
    // Promoting an account to CUSTOMER without a Customer profile would create
    // the same half-provisioned state `create` guards against — block it.
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

  // ─── Private helpers ──────────────────────────────────
  private async assertExists(id: string): Promise<UserModel> {
    const user = await userRepository.findById(id);
    if (!user) throw appError(userErrors.USER_NOT_FOUND);
    return user;
  }

  private async issueTokens(user: UserModel): Promise<AuthTokens> {
    const accessToken = signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = signRefreshToken({ id: user.id });
    // Persist only a hash so a DB leak can't expose usable refresh tokens.
    await userRepository.updateRefreshToken(user.id, hashToken(refreshToken));
    return { accessToken, refreshToken };
  }

  private toUserResponse(user: UserModel): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}

export const userService = new UserService();
