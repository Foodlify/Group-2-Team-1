import { OAuth2Client } from "google-auth-library";
import env from "../../config/env";
import { AppError } from "../../middlewares/error.middleware";
import { userErrors } from "../exceptions/user.errors";

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

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

  authorizationUrl(state: string): string {
    return this.require().generateAuthUrl({
      scope: SCOPES,
      state,

      include_granted_scopes: true,
    });
  }

  async exchangeCode(code: string): Promise<GoogleProfile> {
    const client = this.require();

    let idToken: string | null | undefined;
    try {
      const { tokens } = await client.getToken(code);
      idToken = tokens.id_token;
    } catch {
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
