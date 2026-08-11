import { describe, expect, it } from "vitest";
import {
  comparePassword,
  hashPassword,
  MAX_PASSWORD_BYTES,
} from "../../src/shared/auth/password.helper";

const LEGACY_BCRYPTJS_HASH =
  "$2b$12$f4d54lHOWDLqsbqZp.hZH.e05XR23T9NQHrDpBlLmcF.sN8gobly6";
const LEGACY_PASSWORD = "Passw0rd!23";

describe("hashes written by the previous library still work", () => {
  it("accepts the correct password against a bcryptjs hash", async () => {
    expect(await comparePassword(LEGACY_PASSWORD, LEGACY_BCRYPTJS_HASH)).toBe(
      true,
    );
  });

  it("still rejects a wrong password against that same hash", async () => {
    expect(await comparePassword("wrong-password", LEGACY_BCRYPTJS_HASH)).toBe(
      false,
    );
  });
});

describe("hashing", () => {
  it("produces a $2b$ hash at cost 12", async () => {
    const hash = await hashPassword("some-password");

    expect(hash.startsWith("$2b$12$")).toBe(true);
  });

  it("salts, so the same password never hashes twice the same way", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same-password"),
      hashPassword("same-password"),
    ]);

    expect(a).not.toBe(b);
    expect(await comparePassword("same-password", a)).toBe(true);
    expect(await comparePassword("same-password", b)).toBe(true);
  });

  it("round-trips a freshly hashed password", async () => {
    const hash = await hashPassword("round-trip");

    expect(await comparePassword("round-trip", hash)).toBe(true);
    expect(await comparePassword("round-tri", hash)).toBe(false);
  });
});

describe("the 72-byte limit bcrypt does not tell you about", () => {
  it("caps at exactly the number of bytes bcrypt reads", () => {
    expect(MAX_PASSWORD_BYTES).toBe(72);
  });

  it("demonstrates why the cap is needed", async () => {
    const seventyTwo = "A".repeat(72);
    const hash = await hashPassword(seventyTwo + "-THIS-TAIL-IS-IGNORED");

    expect(await comparePassword(seventyTwo, hash)).toBe(true);
    expect(
      await comparePassword(seventyTwo + "-COMPLETELY-DIFFERENT", hash),
    ).toBe(true);
  });
});

describe("an account that has no password at all", () => {
  it("never matches, whatever is offered", async () => {
    expect(await comparePassword("anything", null)).toBe(false);
    expect(await comparePassword("", null)).toBe(false);
  });

  it("does not throw, so login answers 'wrong credentials' as usual", async () => {
    await expect(comparePassword("anything", null)).resolves.toBe(false);
  });
});
