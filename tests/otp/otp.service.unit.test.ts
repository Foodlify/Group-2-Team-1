/**
 * OTP Service — unit tests.
 *
 * The repository, mailer, and hashing helper are mocked: these tests pin the
 * ported flow's guarantees — per-email rate limiting, single active code,
 * hashed-at-rest storage, email-only delivery (the code must never appear in
 * the return value), and single-use verification.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/otp/otp.repository", () => ({
  otpRepository: {
    countRecent: vi.fn(),
    deleteUnused: vi.fn(),
    create: vi.fn(),
    findLatestValid: vi.fn(),
    markUsed: vi.fn(),
  },
}));

vi.mock("../../src/shared/mail/mailer", () => ({
  mailer: {
    sendOtp: vi.fn(),
  },
}));

// Deterministic, instant "hashing" — the service must store/compare through
// this helper, never the plaintext.
vi.mock("../../src/shared/auth/password.helper", () => ({
  hashPassword: vi.fn(async (value: string) => `hashed:${value}`),
  comparePassword: vi.fn(
    async (plain: string, hash: string) => hash === `hashed:${plain}`,
  ),
}));

import { otpService } from "../../src/modules/otp/otp.service";
import { otpRepository } from "../../src/modules/otp/otp.repository";
import { mailer } from "../../src/shared/mail/mailer";
import { otpErrors } from "../../src/shared/exceptions/otp.errors";

const mockedRepo = vi.mocked(otpRepository);
const mockedMailer = vi.mocked(mailer);

const EMAIL = "jane@example.com";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendOtp", () => {
  it("stores only the hash and emails the plaintext code", async () => {
    mockedRepo.countRecent.mockResolvedValue(0);

    const result = await otpService.sendOtp(EMAIL, "registration");

    // A single pending code per email+purpose: older ones are invalidated.
    expect(mockedRepo.deleteUnused).toHaveBeenCalledWith(EMAIL, "registration");

    const createArg = mockedRepo.create.mock.calls[0]?.[0] as {
      data: { email: string; codeHash: string; purpose: string };
    };
    expect(createArg.data.email).toBe(EMAIL);
    expect(createArg.data.purpose).toBe("registration");
    // Stored value is the hash of a 6-digit code, not the code itself.
    expect(createArg.data.codeHash).toMatch(/^hashed:\d{6}$/);

    const emailedCode = mockedMailer.sendOtp.mock.calls[0]?.[1];
    expect(emailedCode).toMatch(/^\d{6}$/);
    expect(createArg.data.codeHash).toBe(`hashed:${emailedCode}`);

    // The response exposes the expiry ONLY — never the code.
    expect(Object.keys(result)).toEqual(["expiresAt"]);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects with 429 once the per-email window is exhausted", async () => {
    mockedRepo.countRecent.mockResolvedValue(3);

    await expect(
      otpService.sendOtp(EMAIL, "registration"),
    ).rejects.toMatchObject({
      message: otpErrors.TOO_MANY_REQUESTS.message,
      statusCode: otpErrors.TOO_MANY_REQUESTS.statusCode,
    });
    expect(mockedRepo.create).not.toHaveBeenCalled();
    expect(mockedMailer.sendOtp).not.toHaveBeenCalled();
  });
});

describe("verifyOtp", () => {
  const storedOtp = {
    id: "otp_1",
    email: EMAIL,
    codeHash: "hashed:482913",
    purpose: "registration",
    used: false,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
  };

  it("accepts the correct code and marks it used", async () => {
    mockedRepo.findLatestValid.mockResolvedValue(storedOtp);

    await otpService.verifyOtp(EMAIL, "482913", "registration");

    expect(mockedRepo.markUsed).toHaveBeenCalledWith("otp_1");
  });

  it("rejects when no pending code exists (absent or expired)", async () => {
    mockedRepo.findLatestValid.mockResolvedValue(null);

    await expect(
      otpService.verifyOtp(EMAIL, "482913", "registration"),
    ).rejects.toMatchObject({
      statusCode: otpErrors.INVALID_OTP.statusCode,
    });
    expect(mockedRepo.markUsed).not.toHaveBeenCalled();
  });

  it("rejects a wrong code without consuming the stored one", async () => {
    mockedRepo.findLatestValid.mockResolvedValue(storedOtp);

    await expect(
      otpService.verifyOtp(EMAIL, "000000", "registration"),
    ).rejects.toMatchObject({
      message: otpErrors.INVALID_OTP.message,
    });
    expect(mockedRepo.markUsed).not.toHaveBeenCalled();
  });
});
