export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export const sendSuccess = <T>(
  res: import("express").Response,
  data: T,
  message: string = "Success",
  statusCode: number = 200,
): void => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  } as ApiResponse<T>);
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
