/**
 * User Service — password-reset unit tests.
 *
 * The repositories, OTP service, and password helper are mocked so each test
 * asserts pure service logic with no database and no real hashing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/user/user.repository", () => ({
  userRepository: {
    findByEmail: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../../src/modules/user/refreshToken.repository", () => ({
  refreshTokenRepository: {
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
  comparePassword: vi.fn(),
}));

import { userService } from "../../src/modules/user/user.service";
import { userRepository } from "../../src/modules/user/user.repository";
import { refreshTokenRepository } from "../../src/modules/user/refreshToken.repository";
import { otpService } from "../../src/modules/otp/otp.service";
import { otpErrors } from "../../src/shared/exceptions/otp.errors";

const mockedUsers = vi.mocked(userRepository);
const mockedSessions = vi.mocked(refreshTokenRepository);
const mockedOtp = vi.mocked(otpService);

type UserRow = NonNullable<
  Awaited<ReturnType<typeof userRepository.findByEmail>>
>;

const userRow = {
  id: "user_1",
  email: "jane@example.com",
} as unknown as UserRow;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("forgotPassword", () => {
  it("sends a password_reset OTP when the email has an account", async () => {
    mockedUsers.findByEmail.mockResolvedValue(userRow);
    mockedOtp.sendOtp.mockResolvedValue({
      expiresAt: "2026-08-06T10:10:00.000Z",
    });

    await userService.forgotPassword("jane@example.com");

    expect(mockedOtp.sendOtp).toHaveBeenCalledWith(
      "jane@example.com",
      "password_reset",
    );
  });

  it("silently does nothing for an unknown email (no enumeration)", async () => {
    mockedUsers.findByEmail.mockResolvedValue(null);

    await expect(
      userService.forgotPassword("nobody@example.com"),
    ).resolves.toBeUndefined();

    expect(mockedOtp.sendOtp).not.toHaveBeenCalled();
  });
});

describe("resetPassword", () => {
  const input = {
    email: "jane@example.com",
    code: "123456",
    newPassword: "NewPassword123!",
  };

  it("verifies the code, stores the hashed password, and revokes all sessions", async () => {
    mockedOtp.verifyOtp.mockResolvedValue(undefined);
    mockedUsers.findByEmail.mockResolvedValue(userRow);
    mockedUsers.update.mockResolvedValue(userRow);
    mockedSessions.revokeAllForUser.mockResolvedValue(undefined);

    await userService.resetPassword(input);

    expect(mockedOtp.verifyOtp).toHaveBeenCalledWith(
      "jane@example.com",
      "123456",
      "password_reset",
    );
    expect(mockedUsers.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { password: "hashed:NewPassword123!" },
    });
    expect(mockedSessions.revokeAllForUser).toHaveBeenCalledWith("user_1");
  });

  it("does not touch the password when the code is invalid", async () => {
    mockedOtp.verifyOtp.mockRejectedValue(
      Object.assign(new Error(otpErrors.INVALID_OTP.message), {
        statusCode: otpErrors.INVALID_OTP.statusCode,
      }),
    );

    await expect(userService.resetPassword(input)).rejects.toMatchObject({
      statusCode: otpErrors.INVALID_OTP.statusCode,
    });
    expect(mockedUsers.update).not.toHaveBeenCalled();
    expect(mockedSessions.revokeAllForUser).not.toHaveBeenCalled();
  });

  it("fails with the same generic error when the account vanished", async () => {
    mockedOtp.verifyOtp.mockResolvedValue(undefined);
    mockedUsers.findByEmail.mockResolvedValue(null);

    await expect(userService.resetPassword(input)).rejects.toMatchObject({
      message: otpErrors.INVALID_OTP.message,
      statusCode: otpErrors.INVALID_OTP.statusCode,
    });
    expect(mockedUsers.update).not.toHaveBeenCalled();
  });
});
