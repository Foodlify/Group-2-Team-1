/**
 * The 72-byte password cap.
 *
 * bcrypt reads at most 72 bytes and throws nothing away loudly — a longer
 * password is accepted at registration and then authenticates on its first 72
 * bytes alone. Switching to the native binding did not change this; it is the
 * algorithm, not the library. The only place it can be caught is here, before
 * the password reaches the hasher.
 *
 * The interesting half is the unit: **bytes, not characters**. A cap written as
 * `.max(72)` on string length looks right and lets a 72-character Arabic
 * password through at 144 bytes — exactly the case it was added to prevent.
 */
import { describe, expect, it } from "vitest";
import {
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
    // The first length bcrypt would start discarding at.
    expect(register("A".repeat(73)).success).toBe(false);
  });

  it("still enforces the minimum", () => {
    expect(register("short").success).toBe(false);
  });

  it("counts bytes, not characters", () => {
    // 40 Arabic letters: well under any character limit, 80 bytes in UTF-8.
    // A `.max(72)` on string length accepts this and hands bcrypt a password
    // whose last 8 bytes it will quietly ignore.
    const arabic = "ك".repeat(40);
    expect(arabic.length).toBeLessThan(72);
    expect(Buffer.byteLength(arabic, "utf8")).toBeGreaterThan(72);

    expect(register(arabic).success).toBe(false);
  });

  it("accepts multi-byte characters that do fit", () => {
    // 30 Arabic letters = 60 bytes. Nothing about this cap should punish a
    // non-Latin password that bcrypt can read in full.
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
    // The other door into `hashPassword`. Capping only registration would
    // leave it wide open.
    const result = ResetPasswordRequestSchema.safeParse({
      email: "jane@example.com",
      code: "123456",
      newPassword: "A".repeat(73),
    });

    expect(result.success).toBe(false);
  });
});

describe("where a password is only checked", () => {
  it("does not cap login", () => {
    // An account created before the cap may hold a longer password. Rejecting
    // it here would lock someone out of an account they can still sign into —
    // bcrypt compares the same 72 bytes either way.
    const result = LoginRequestSchema.safeParse({
      email: "jane@example.com",
      password: "A".repeat(200),
    });

    expect(result.success).toBe(true);
  });
});
