export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  meta?: unknown;
  error?: string;
}

export const sendSuccess = <T>(
  res: import("express").Response,
  data: T,
  message: string = "Success",
  statusCode: number = 200,
  meta?: unknown,
): void => {
  const body: ApiResponse<T> = { success: true, message, data };
  if (meta !== undefined) {
    body.meta = meta;
  }
  res.status(statusCode).json(body);
};

export const sendError = (
  res: import("express").Response,
  message: string = "Something went wrong",
  statusCode: number = 500,
  error?: string,
): void => {
  res.status(statusCode).json({
    success: false,
    message,
    error,
  } as ApiResponse<never>);
};
