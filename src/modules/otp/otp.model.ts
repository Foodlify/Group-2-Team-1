export type OtpPurpose = "registration" | "password_reset";

export type SendOtpRequest = {
  email: string;
  purpose: OtpPurpose;
};

export type VerifyOtpRequest = {
  email: string;
  code: string;
  purpose: OtpPurpose;
};

export type OtpResponse = {
  message: string;
  expiresAt: Date;
};
