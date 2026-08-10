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

    expect(a).not.toBe(b);
  });

  it("hash differently, so both can be stored", () => {
    const a = hashToken(signRefreshToken({ id: "user_1" }));
    const b = hashToken(signRefreshToken({ id: "user_1" }));

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

    expect(a.jti).not.toBe(b.jti);
    expect(String(a.jti)).toHaveLength(36);
    expect(a.id).toBe(b.id);
    expect(a.type).toBe("refresh");
  });
});

describe("the token still verifies", () => {
  it("round-trips through verifyRefreshToken", () => {
    const token = signRefreshToken({ id: "user_1" });

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
