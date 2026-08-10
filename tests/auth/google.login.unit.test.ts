import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/user/user.repository", () => ({
  userRepository: {
    findByGoogleId: vi.fn(),
    findByEmail: vi.fn(),
    linkGoogleId: vi.fn(),
    createGoogleCustomerUser: vi.fn(),
  },
}));

vi.mock("../../src/modules/user/refreshToken.repository", () => ({
  refreshTokenRepository: {
    deleteInactiveForUser: vi.fn(),
    createForUser: vi.fn(),
  },
}));

vi.mock("../../src/modules/otp/otp.service", () => ({
  otpService: { sendOtp: vi.fn() },
}));

import { userService } from "../../src/modules/user/user.service";
import { userRepository } from "../../src/modules/user/user.repository";
import { userErrors } from "../../src/shared/exceptions/user.errors";

const mockedUsers = vi.mocked(userRepository);

const now = new Date("2026-08-11T10:00:00.000Z");

const account = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "user_1",
    name: "Jane",
    email: "jane@example.com",
    password: "$2b$12$hash",
    googleId: null,
    role: "CUSTOMER",
    emailVerifiedAt: now,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }) as never;

const PROFILE = {
  googleId: "google-sub-123",
  email: "jane@example.com",
  emailVerified: true,
  name: "Jane",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedUsers.findByGoogleId.mockResolvedValue(null);
  mockedUsers.findByEmail.mockResolvedValue(null);
  mockedUsers.linkGoogleId.mockResolvedValue(
    account({ googleId: PROFILE.googleId }),
  );
  mockedUsers.createGoogleCustomerUser.mockResolvedValue(
    account({ id: "user_new", password: null, googleId: PROFILE.googleId }),
  );
});

describe("a returning Google user", () => {
  it("is matched on the Google subject", async () => {
    mockedUsers.findByGoogleId.mockResolvedValue(
      account({ googleId: PROFILE.googleId }),
    );

    const result = await userService.loginWithGoogle(PROFILE);

    expect(result.user.id).toBe("user_1");
    expect(mockedUsers.findByGoogleId).toHaveBeenCalledWith("google-sub-123");
  });

  it("is found even after changing their address at Google", async () => {
    mockedUsers.findByGoogleId.mockResolvedValue(
      account({ googleId: PROFILE.googleId, email: "old@example.com" }),
    );

    const result = await userService.loginWithGoogle({
      ...PROFILE,
      email: "brand-new@example.com",
    });

    expect(result.user.id).toBe("user_1");
    expect(mockedUsers.createGoogleCustomerUser).not.toHaveBeenCalled();
    expect(mockedUsers.findByEmail).not.toHaveBeenCalled();
  });

  it("is refused when the account has been disabled", async () => {
    mockedUsers.findByGoogleId.mockResolvedValue(
      account({ googleId: PROFILE.googleId, isActive: false }),
    );

    await expect(userService.loginWithGoogle(PROFILE)).rejects.toMatchObject({
      message: userErrors.ACCOUNT_DISABLED.message,
    });
  });
});

describe("linking to an account that already exists", () => {
  it("links when the email matches and Google verified it", async () => {
    mockedUsers.findByEmail.mockResolvedValue(account());

    await userService.loginWithGoogle(PROFILE);

    expect(mockedUsers.linkGoogleId).toHaveBeenCalledWith(
      "user_1",
      "google-sub-123",
    );
    expect(mockedUsers.createGoogleCustomerUser).not.toHaveBeenCalled();
  });

  it("refuses outright when Google has not verified the email", async () => {
    mockedUsers.findByEmail.mockResolvedValue(account());

    await expect(
      userService.loginWithGoogle({ ...PROFILE, emailVerified: false }),
    ).rejects.toMatchObject({
      message: userErrors.GOOGLE_EMAIL_UNVERIFIED.message,
      statusCode: 403,
    });
  });

  it("links nothing and creates nothing on an unverified email", async () => {
    mockedUsers.findByEmail.mockResolvedValue(account());

    await expect(
      userService.loginWithGoogle({ ...PROFILE, emailVerified: false }),
    ).rejects.toThrow();

    expect(mockedUsers.linkGoogleId).not.toHaveBeenCalled();
    expect(mockedUsers.createGoogleCustomerUser).not.toHaveBeenCalled();
  });

  it("refuses an unverified email even for a brand-new address", async () => {
    await expect(
      userService.loginWithGoogle({
        ...PROFILE,
        email: "nobody@example.com",
        emailVerified: false,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("checks the account is usable before writing the link", async () => {
    mockedUsers.findByEmail.mockResolvedValue(account({ isActive: false }));

    await expect(userService.loginWithGoogle(PROFILE)).rejects.toMatchObject({
      message: userErrors.ACCOUNT_DISABLED.message,
    });

    expect(mockedUsers.linkGoogleId).not.toHaveBeenCalled();
  });

  it("refuses an account whose email was never verified here", async () => {
    mockedUsers.findByEmail.mockResolvedValue(
      account({ emailVerifiedAt: null }),
    );

    await expect(userService.loginWithGoogle(PROFILE)).rejects.toMatchObject({
      message: userErrors.EMAIL_NOT_VERIFIED.message,
    });
  });
});

describe("a Google identity nobody has registered", () => {
  it("creates a customer account", async () => {
    const result = await userService.loginWithGoogle(PROFILE);

    expect(mockedUsers.createGoogleCustomerUser).toHaveBeenCalledWith({
      name: "Jane",
      email: "jane@example.com",
      googleId: "google-sub-123",
    });
    expect(result.user.id).toBe("user_new");
  });

  it("issues our own session, not Google's", async () => {
    const result = await userService.loginWithGoogle(PROFILE);

    expect(result.tokens.accessToken).toBeTruthy();
    expect(result.tokens.refreshToken).toBeTruthy();
  });

  it("never returns the password field, null or not", async () => {
    const result = await userService.loginWithGoogle(PROFILE);

    expect(JSON.stringify(result.user)).not.toContain("password");
  });
});
