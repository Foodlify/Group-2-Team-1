import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import env from "./env";

const { combine, timestamp, json, colorize, simple } = winston.format;

const isDev = env.NODE_ENV === "development";

/**
 * Console first, and unconditionally: it is the only transport that works
 * everywhere. A container platform reads stdout, and a process that can only
 * report itself to a file it may not be allowed to create is a process that
 * dies before it can say why — which is exactly what happened the first time
 * this image ran as a non-root user.
 */
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isDev
      ? combine(colorize(), simple())
      : combine(timestamp(), json()),
  }),
];

// Empty LOG_DIR means stdout only. Anything else is a directory the rotating
// files go in; winston creates it, so it has to be somewhere this user can
// write — under a mounted volume, or inside the image with the ownership set.
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
