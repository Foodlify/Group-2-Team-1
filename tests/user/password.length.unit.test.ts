import { describe, expect, it } from "vitest";
import {
  AdminLoginRequestSchema,
  CreateUserRequestSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
} from "../../src/modules/user/user.validation";

const register = (password: string) =>
  RegisterRequestSchema.safeParse({
    name: "Jane Doe",
    email: "jane@example.com",
    password,
    phone: "+201000000000",
  });

describe("where a password is set", () => {
  it("accepts one that fits in exactly 72 bytes", () => {
    expect(register("A".repeat(72)).success).toBe(true);
  });

  it("rejects one byte more", () => {
    expect(register("A".repeat(73)).success).toBe(false);
  });

  it("still enforces the minimum", () => {
    expect(register("short").success).toBe(false);
  });

  it("counts bytes, not characters", () => {
    const arabic = "ك".repeat(40);
    expect(arabic.length).toBeLessThan(72);
    expect(Buffer.byteLength(arabic, "utf8")).toBeGreaterThan(72);

    expect(register(arabic).success).toBe(false);
  });

  it("accepts multi-byte characters that do fit", () => {
    const arabic = "ك".repeat(30);
    expect(Buffer.byteLength(arabic, "utf8")).toBeLessThanOrEqual(72);

    expect(register(arabic).success).toBe(true);
  });

  it("applies to admin-created accounts", () => {
    const result = CreateUserRequestSchema.safeParse({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "A".repeat(73),
      role: "ADMIN",
    });

    expect(result.success).toBe(false);
  });

  it("applies to a password set through the reset flow", () => {
    const result = ResetPasswordRequestSchema.safeParse({
      email: "jane@example.com",
      code: "123456",
      newPassword: "A".repeat(73),
    });

    expect(result.success).toBe(false);
  });
});

describe("where a password is only checked", () => {
  it("rejects an over-long password at login too", () => {
    const result = LoginRequestSchema.safeParse({
      email: "jane@example.com",
      password: "A".repeat(200),
    });

    expect(result.success).toBe(false);
  });

  it("does not impose the registration minimum on login", () => {
    const result = LoginRequestSchema.safeParse({
      email: "jane@example.com",
      password: "short",
    });

    expect(result.success).toBe(true);
  });

  it("caps admin login on the same rule", () => {
    const result = AdminLoginRequestSchema.safeParse({
      email: "admin@example.com",
      password: "A".repeat(73),
    });

    expect(result.success).toBe(false);
  });
});
