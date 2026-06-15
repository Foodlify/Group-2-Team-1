export type JwtPayload = {
  id: string;
  email: string;
  role: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken?: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};
