import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/user/user.repository", () => ({
  userRepository: {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    phoneExists: vi.fn(),
    createCustomerUser: vi.fn(),
    markEmailVerified: vi.fn(),
    setActive: vi.fn(),
  },
}));

vi.mock("../../src/modules/user/refreshToken.repository", () => ({
  refreshTokenRepository: {
    createForUser: vi.fn(),
    deleteInactiveForUser: vi.fn(),
    revokeAllForUser: vi.fn(),
  },
}));

vi.mock("../../src/modules/otp/otp.service", () => ({
  otpService: {
    sendOtp: vi.fn(),
    verifyOtp: vi.fn(),
  },
}));

vi.mock("../../src/shared/auth/password.helper", () => ({
  hashPassword: vi.fn(async (value: string) => `hashed:${value}`),
  comparePassword: vi.fn(async () => true),
}));

import { userService } from "../../src/modules/user/user.service";
import { userRepository } from "../../src/modules/user/user.repository";
import { refreshTokenRepository } from "../../src/modules/user/refreshToken.repository";
import { otpService } from "../../src/modules/otp/otp.service";
import { userErrors } from "../../src/shared/exceptions/user.errors";

const mockedUsers = vi.mocked(userRepository);
const mockedSessions = vi.mocked(refreshTokenRepository);
const mockedOtp = vi.mocked(otpService);

type UserRow = NonNullable<Awaited<ReturnType<typeof userRepository.findById>>>;

const now = new Date("2026-08-06T10:00:00.000Z");
const baseUser = {
  id: "user_1",
  name: "Jane",
  email: "jane@example.com",
  password: "hashed:Password123!",
  role: "CUSTOMER",
  emailVerifiedAt: now,
  isActive: true,
  createdAt: now,
  updatedAt: now,
} as unknown as UserRow;

const unverifiedUser = { ...baseUser, emailVerifiedAt: null } as UserRow;
const disabledUser = { ...baseUser, isActive: false } as UserRow;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("register", () => {
  it("emails a registration code and issues no tokens", async () => {
    mockedUsers.findByEmail.mockResolvedValue(null);
    mockedUsers.phoneExists.mockResolvedValue(false);
    mockedUsers.createCustomerUser.mockResolvedValue(unverifiedUser);
    mockedOtp.sendOtp.mockResolvedValue({ expiresAt: now.toISOString() });

    const result = await userService.register({
      name: "Jane",
      email: "jane@example.com",
      password: "Password123!",
      phone: "+201000000000",
    });

    expect(mockedOtp.sendOtp).toHaveBeenCalledWith(
      "jane@example.com",
      "registration",
    );
    expect(result).not.toHaveProperty("tokens");
    expect(result.user.emailVerified).toBe(false);
    expect(mockedSessions.createForUser).not.toHaveBeenCalled();
  });
});

describe("verifyEmail", () => {
  const input = { email: "jane@example.com", code: "123456" };

  it("verifies the code, stamps the account, and logs it in", async () => {
    mockedUsers.findByEmail.mockResolvedValue(unverifiedUser);
    mockedOtp.verifyOtp.mockResolvedValue(undefined);
    mockedUsers.markEmailVerified.mockResolvedValue(baseUser);

    const result = await userService.verifyEmail(input);

    expect(mockedOtp.verifyOtp).toHaveBeenCalledWith(
      "jane@example.com",
      "123456",
      "registration",
    );
    expect(mockedUsers.markEmailVerified).toHaveBeenCalledWith("user_1");
    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.user.emailVerified).toBe(true);
  });

  it("rejects a second verification (409)", async () => {
    mockedUsers.findByEmail.mockResolvedValue(baseUser);

    await expect(userService.verifyEmail(input)).rejects.toMatchObject({
      statusCode: userErrors.EMAIL_ALREADY_VERIFIED.statusCode,
    });
    expect(mockedOtp.verifyOtp).not.toHaveBeenCalled();
  });
});

describe("login gates", () => {
  it("blocks an unverified account with 403", async () => {
    mockedUsers.findByEmail.mockResolvedValue(unverifiedUser);

    await expect(
      userService.login({
        email: "jane@example.com",
        password: "Password123!",
      }),
    ).rejects.toMatchObject({
      message: userErrors.EMAIL_NOT_VERIFIED.message,
      statusCode: userErrors.EMAIL_NOT_VERIFIED.statusCode,
    });
  });

  it("blocks a disabled account with 403", async () => {
    mockedUsers.findByEmail.mockResolvedValue(disabledUser);

    await expect(
      userService.login({
        email: "jane@example.com",
        password: "Password123!",
      }),
    ).rejects.toMatchObject({
      message: userErrors.ACCOUNT_DISABLED.message,
      statusCode: userErrors.ACCOUNT_DISABLED.statusCode,
    });
  });

  it("lets a verified, active account in", async () => {
    mockedUsers.findByEmail.mockResolvedValue(baseUser);

    const result = await userService.login({
      email: "jane@example.com",
      password: "Password123!",
    });

    expect(result.tokens.refreshToken).toBeTruthy();
    expect(mockedSessions.createForUser).toHaveBeenCalled();
  });
});

describe("setActive", () => {
  it("revokes every session when disabling", async () => {
    mockedUsers.findById.mockResolvedValue(baseUser);
    mockedUsers.setActive.mockResolvedValue(disabledUser);

    const result = await userService.setActive("user_1", false);

    expect(mockedUsers.setActive).toHaveBeenCalledWith("user_1", false);
    expect(mockedSessions.revokeAllForUser).toHaveBeenCalledWith("user_1");
    expect(result.isActive).toBe(false);
  });

  it("does not revoke sessions when re-enabling", async () => {
    mockedUsers.findById.mockResolvedValue(disabledUser);
    mockedUsers.setActive.mockResolvedValue(baseUser);

    await userService.setActive("user_1", true);

    expect(mockedSessions.revokeAllForUser).not.toHaveBeenCalled();
  });

  it("throws 404 for an unknown user", async () => {
    mockedUsers.findById.mockResolvedValue(null);

    await expect(userService.setActive("nope", false)).rejects.toMatchObject({
      statusCode: userErrors.USER_NOT_FOUND.statusCode,
    });
    expect(mockedUsers.setActive).not.toHaveBeenCalled();
  });
});

describe("deactivateSelf", () => {
  it("disables the account and revokes its sessions", async () => {
    mockedUsers.findById.mockResolvedValue(baseUser);
    mockedUsers.setActive.mockResolvedValue(disabledUser);

    await userService.deactivateSelf("user_1");

    expect(mockedUsers.setActive).toHaveBeenCalledWith("user_1", false);
    expect(mockedSessions.revokeAllForUser).toHaveBeenCalledWith("user_1");
  });
});
