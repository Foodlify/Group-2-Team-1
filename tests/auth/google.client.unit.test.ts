import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getToken = vi.fn();
const verifyIdToken = vi.fn();
const generateAuthUrl = vi.fn(
  () => "https://accounts.google.com/o/oauth2/auth",
);

vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    getToken = getToken;
    verifyIdToken = verifyIdToken;
    generateAuthUrl = generateAuthUrl;
  },
}));

import { userErrors } from "../../src/shared/exceptions/user.errors";

const CLIENT_ID = "unit-client-id.apps.googleusercontent.com";

type GoogleClient =
  typeof import("../../src/shared/auth/google.client").googleAuthClient;
let googleAuthClient: GoogleClient;

const ticketFor = (payload: Record<string, unknown>) => ({
  getPayload: () => payload,
});

const PAYLOAD = {
  sub: "google-sub-1",
  email: "Person@Example.com",
  email_verified: true,
  name: "  Person  ",
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "unit-client-secret");
  vi.resetModules();
  ({ googleAuthClient } = await import("../../src/shared/auth/google.client"));

  getToken.mockResolvedValue({ tokens: { id_token: "id-token" } });
  verifyIdToken.mockResolvedValue(ticketFor(PAYLOAD));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("verifying the ID token", () => {
  it("checks it was minted for THIS application", async () => {
    await googleAuthClient.exchangeCode("code");

    expect(verifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({
        idToken: "id-token",
        audience: CLIENT_ID,
      }),
    );
  });

  it("verifies rather than merely decoding", async () => {
    await googleAuthClient.exchangeCode("code");

    expect(verifyIdToken).toHaveBeenCalledTimes(1);
  });
});

describe("what comes back", () => {
  it("takes the subject, the email, the verified flag and the name", async () => {
    const profile = await googleAuthClient.exchangeCode("code");

    expect(profile).toEqual({
      googleId: "google-sub-1",

      email: "person@example.com",
      emailVerified: true,
      name: "Person",
    });
  });

  it("reports an unverified email as unverified, rather than dropping it", async () => {
    verifyIdToken.mockResolvedValue(
      ticketFor({ ...PAYLOAD, email_verified: false }),
    );

    const profile = await googleAuthClient.exchangeCode("code");

    expect(profile.emailVerified).toBe(false);
  });

  it("treats a missing verified claim as unverified", async () => {
    verifyIdToken.mockResolvedValue(
      ticketFor({ ...PAYLOAD, email_verified: undefined }),
    );

    expect((await googleAuthClient.exchangeCode("code")).emailVerified).toBe(
      false,
    );
  });

  it("falls back to the address when the profile scope was declined", async () => {
    verifyIdToken.mockResolvedValue(ticketFor({ ...PAYLOAD, name: undefined }));

    expect((await googleAuthClient.exchangeCode("code")).name).toBe("Person");
  });

  it("keeps none of Google's tokens", async () => {
    getToken.mockResolvedValue({
      tokens: {
        id_token: "id-token",
        access_token: "ya29.secret-access-token",
        refresh_token: "1//secret-refresh-token",
      },
    });

    const profile = await googleAuthClient.exchangeCode("code");

    expect(JSON.stringify(profile)).not.toContain("ya29.");
    expect(JSON.stringify(profile)).not.toContain("1//");
  });
});

describe("when the exchange does not work", () => {
  it("401s a code Google rejects", async () => {
    getToken.mockRejectedValue(new Error("invalid_grant"));

    await expect(googleAuthClient.exchangeCode("stale")).rejects.toMatchObject({
      message: userErrors.GOOGLE_EXCHANGE_FAILED.message,
      statusCode: 401,
    });
  });

  it("401s a response carrying no ID token", async () => {
    getToken.mockResolvedValue({ tokens: {} });

    await expect(googleAuthClient.exchangeCode("code")).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("401s a verified token with no subject", async () => {
    verifyIdToken.mockResolvedValue(ticketFor({ email: "a@b.example" }));

    await expect(googleAuthClient.exchangeCode("code")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("401s a verified token with no email", async () => {
    verifyIdToken.mockResolvedValue(ticketFor({ sub: "google-sub-1" }));

    await expect(googleAuthClient.exchangeCode("code")).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe("the consent screen URL", () => {
  it("asks for identity scopes and carries the state", async () => {
    googleAuthClient.authorizationUrl("state-value");

    expect(generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: ["openid", "email", "profile"],
        state: "state-value",
      }),
    );
  });

  it("never asks for offline access", () => {
    googleAuthClient.authorizationUrl("state-value");

    expect(generateAuthUrl).not.toHaveBeenCalledWith(
      expect.objectContaining({ access_type: "offline" }),
    );
  });
});
