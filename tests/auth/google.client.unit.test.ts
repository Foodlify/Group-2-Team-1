/**
 * The Google client — the exchange itself.
 *
 * Every other Google test stubs this module out, which is exactly why it needs
 * its own: the audience check lives here, and a mutation that removed it
 * survived the entire suite. Without `audience`, an ID token minted for any
 * other application on Google would verify, and anyone with their own OAuth
 * client could sign in as anybody.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getToken = vi.fn();
const verifyIdToken = vi.fn();
const generateAuthUrl = vi.fn(
  () => "https://accounts.google.com/o/oauth2/auth",
);

// A class, not `vi.fn(() => ({...}))`: the module under test calls
// `new OAuth2Client(...)`, and an arrow function cannot be constructed.
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    getToken = getToken;
    verifyIdToken = verifyIdToken;
    generateAuthUrl = generateAuthUrl;
  },
}));

import { userErrors } from "../../src/shared/exceptions/user.errors";

const CLIENT_ID = "unit-client-id.apps.googleusercontent.com";

/**
 * The client reads `env` once when it is constructed, so the credentials have
 * to exist before the import — and be stubbed rather than inherited, or this
 * suite would behave differently on a machine that happens to have real ones.
 */
type GoogleClient =
  typeof import("../../src/shared/auth/google.client").googleAuthClient;
let googleAuthClient: GoogleClient;

/** A verified ticket, as `verifyIdToken` resolves one. */
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

// ═══════════════════════════════════════════════════════════
describe("verifying the ID token", () => {
  it("checks it was minted for THIS application", async () => {
    await googleAuthClient.exchangeCode("code");

    // The mutation that survived without this assertion: drop `audience` and
    // any Google token from any application verifies successfully.
    expect(verifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({
        idToken: "id-token",
        audience: CLIENT_ID,
      }),
    );
  });

  it("verifies rather than merely decoding", async () => {
    await googleAuthClient.exchangeCode("code");

    // `verifyIdToken` checks the signature against Google's published keys.
    // Decoding the claims instead would accept a token anybody wrote.
    expect(verifyIdToken).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════
describe("what comes back", () => {
  it("takes the subject, the email, the verified flag and the name", async () => {
    const profile = await googleAuthClient.exchangeCode("code");

    expect(profile).toEqual({
      googleId: "google-sub-1",
      // Lower-cased: our `User.email` is unique and stored lower-cased, so a
      // capitalised address from Google would create a second account for the
      // same person.
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

    // The refusal belongs to the service, which knows what linking means. The
    // client's job is to report the claim faithfully.
    expect(profile.emailVerified).toBe(false);
  });

  it("treats a missing verified claim as unverified", async () => {
    verifyIdToken.mockResolvedValue(
      ticketFor({ ...PAYLOAD, email_verified: undefined }),
    );

    // Absent is not true. Anything other than an explicit yes has to be no.
    expect((await googleAuthClient.exchangeCode("code")).emailVerified).toBe(
      false,
    );
  });

  it("falls back to the address when the profile scope was declined", async () => {
    verifyIdToken.mockResolvedValue(ticketFor({ ...PAYLOAD, name: undefined }));

    // The local part as Google capitalised it, not the lower-cased address:
    // this is a display name, and "Person" reads better than "person". Only
    // the email itself is normalised, because that one is an identifier.
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

    // Credentials for an API we never call would be a stored liability with
    // no use.
    expect(JSON.stringify(profile)).not.toContain("ya29.");
    expect(JSON.stringify(profile)).not.toContain("1//");
  });
});

// ═══════════════════════════════════════════════════════════
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
    // Nothing to verify means nothing to trust — it must not fall through to
    // a profile with undefined fields.
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

// ═══════════════════════════════════════════════════════════
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

    // A refresh token from Google would let us act on somebody's account long
    // after they signed in. We want to know who they are, once.
    expect(generateAuthUrl).not.toHaveBeenCalledWith(
      expect.objectContaining({ access_type: "offline" }),
    );
  });
});
