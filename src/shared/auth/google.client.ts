import { OAuth2Client } from "google-auth-library";
import env from "../../config/env";
import { AppError } from "../../middlewares/error.middleware";
import { userErrors } from "../exceptions/user.errors";

/**
 * Google sign-in, using the OAuth 2.0 authorization-code flow.
 *
 * The official `Social Media Authentication`. Optional like the mailer, the
 * cache and Stripe: without a client id and secret the routes report that this
 * deployment does not offer it, rather than sending people to a consent screen
 * whose callback cannot complete.
 *
 * The library is Google's own rather than a hand-rolled exchange, for one
 * reason worth stating: `verifyIdToken` checks the token's signature against
 * Google's published keys and validates `aud`, `iss` and `exp`. It is
 * technically permissible to skip the signature when the token came straight
 * from the token endpoint over TLS — but that exemption stops holding the
 * moment anyone reuses this helper for a token supplied by a client, which is
 * the obvious next thing somebody adds for a mobile app. Verifying always
 * means that change is safe by default.
 */

/** What we take from Google, and all we take. */
export interface GoogleProfile {
  /** The `sub` claim — Google's stable id for this person. */
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/** The scopes: identity only. No Gmail, no Drive, no offline access. */
const SCOPES = ["openid", "email", "profile"];

class GoogleAuthClient {
  private readonly client: OAuth2Client | null;

  constructor() {
    this.client =
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? new OAuth2Client({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            redirectUri: env.GOOGLE_CALLBACK_URL,
          })
        : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * The consent screen URL.
   *
   * `state` is carried through by Google untouched and compared on the way
   * back — it is what stops an attacker feeding a victim's browser a callback
   * URL carrying the attacker's own authorization code, which would silently
   * sign the victim into the attacker's account.
   *
   * No `access_type: "offline"`: a refresh token from Google would let us act
   * on someone's account later, and we have no reason to. All we want is who
   * they are, once.
   */
  authorizationUrl(state: string): string {
    return this.require().generateAuthUrl({
      scope: SCOPES,
      state,
      // Google omits the email on a repeat authorisation unless asked.
      include_granted_scopes: true,
    });
  }

  /**
   * Trades the authorization code for the caller's identity.
   *
   * Everything Google returns beyond the identity — the access token, any
   * refresh token — is deliberately dropped on the floor. Keeping credentials
   * for an API we never call would be a stored liability with no use.
   */
  async exchangeCode(code: string): Promise<GoogleProfile> {
    const client = this.require();

    let idToken: string | null | undefined;
    try {
      const { tokens } = await client.getToken(code);
      idToken = tokens.id_token;
    } catch {
      // A code that is expired, already spent, or simply invented.
      throw new AppError(
        userErrors.GOOGLE_EXCHANGE_FAILED.message,
        userErrors.GOOGLE_EXCHANGE_FAILED.statusCode,
      );
    }

    if (!idToken) {
      throw new AppError(
        userErrors.GOOGLE_EXCHANGE_FAILED.message,
        userErrors.GOOGLE_EXCHANGE_FAILED.statusCode,
      );
    }

    const ticket = await client.verifyIdToken({
      idToken,
      // Rejects a token minted for a different application. Without this, any
      // Google token from anywhere would be accepted as one of ours.
      audience: env.GOOGLE_CLIENT_ID!,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      throw new AppError(
        userErrors.GOOGLE_EXCHANGE_FAILED.message,
        userErrors.GOOGLE_EXCHANGE_FAILED.statusCode,
      );
    }

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      // Google omits `name` when the profile scope was declined.
      name: payload.name?.trim() || payload.email.split("@")[0]!,
    };
  }

  private require(): OAuth2Client {
    if (!this.client) {
      throw new AppError(
        userErrors.GOOGLE_NOT_CONFIGURED.message,
        userErrors.GOOGLE_NOT_CONFIGURED.statusCode,
      );
    }
    return this.client;
  }
}

export const googleAuthClient = new GoogleAuthClient();
