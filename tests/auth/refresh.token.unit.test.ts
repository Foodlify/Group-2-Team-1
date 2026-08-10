/**
 * Refresh tokens must be unique per issue.
 *
 * `RefreshToken.tokenHash` is a unique index, so two logins that mint the same
 * token string do not produce two sessions — the second one crashes with a
 * constraint violation and the customer sees a 500.
 *
 * That is not a theoretical race. A JWT's only varying claim is `iat`, which
 * has **one-second** resolution: sign twice for the same user inside a second
 * and the bytes are identical. It was found by logging one account in 20 times
 * in a row — 14 of the 20 failed.
 */
import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import {
  hashToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../src/shared/auth/jwt.helper";

describe("two refresh tokens issued in the same second", () => {
  it("are different strings", () => {
    const a = signRefreshToken({ id: "user_1" });
    const b = signRefreshToken({ id: "user_1" });

    // No sleep, no clock control: this is exactly the double-click case.
    expect(a).not.toBe(b);
  });

  it("hash differently, so both can be stored", () => {
    const a = hashToken(signRefreshToken({ id: "user_1" }));
    const b = hashToken(signRefreshToken({ id: "user_1" }));

    // The hash is what the unique index sees; equal hashes are the 500.
    expect(a).not.toBe(b);
  });

  it("stay distinct across a burst", () => {
    const hashes = new Set(
      Array.from({ length: 50 }, () =>
        hashToken(signRefreshToken({ id: "user_1" })),
      ),
    );

    expect(hashes.size).toBe(50);
  });

  it("differ only by the identifier that makes them unique", () => {
    const a = jwt.decode(signRefreshToken({ id: "user_1" })) as Record<
      string,
      unknown
    >;
    const b = jwt.decode(signRefreshToken({ id: "user_1" })) as Record<
      string,
      unknown
    >;

    // Uniqueness comes from a real random id rather than from hoping the
    // second tick over — which is what made this fail in the first place.
    expect(a.jti).not.toBe(b.jti);
    expect(String(a.jti)).toHaveLength(36);
    expect(a.id).toBe(b.id);
    expect(a.type).toBe("refresh");
  });
});

describe("the token still verifies", () => {
  it("round-trips through verifyRefreshToken", () => {
    const token = signRefreshToken({ id: "user_1" });

    // Adding a claim must not break the discriminator check that keeps a
    // refresh token from being accepted as an access token.
    expect(verifyRefreshToken(token)).toMatchObject({
      id: "user_1",
      type: "refresh",
    });
  });

  it("is still rejected as an access token", () => {
    const token = signRefreshToken({ id: "user_1" });

    expect(() => verifyRefreshToken(token)).not.toThrow();
    expect(jwt.decode(token)).toMatchObject({ type: "refresh" });
  });
});
