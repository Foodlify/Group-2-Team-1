import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import env from "./env";

const { combine, timestamp, json, colorize, simple } = winston.format;

const isDev = env.NODE_ENV === "development";

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isDev
      ? combine(colorize(), simple())
      : combine(timestamp(), json()),
  }),
];

if (env.LOG_DIR) {
  const inDir = (name: string): string => `${env.LOG_DIR}/${name}`;
  transports.push(
    new DailyRotateFile({
      filename: inDir("combined-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      maxFiles: "14d",
      maxSize: "20m",
    }),
    new DailyRotateFile({
      filename: inDir("error-%DATE%.log"),
      datePattern: "YYYY-MM-DD",
      level: "error",
      maxFiles: "14d",
      maxSize: "20m",
    }),
  );
}

const winstonLogger = winston.createLogger({
  level: isDev ? "debug" : "info",
  format: combine(timestamp(), json()),
  transports,
});

const logger = {
  info: (message: string, data?: unknown): void => {
    winstonLogger.info(message, { data });
  },
  warn: (message: string, data?: unknown): void => {
    winstonLogger.warn(message, { data });
  },
  error: (message: string, data?: unknown): void => {
    winstonLogger.error(message, { data });
  },
  debug: (message: string, data?: unknown): void => {
    winstonLogger.debug(message, { data });
  },
};

export default logger;
