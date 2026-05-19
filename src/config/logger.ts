type LogLevel = "info" | "warn" | "error" | "debug";

interface LogMessage {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
}

const formatLog = (
  level: LogLevel,
  message: string,
  data?: unknown,
): LogMessage => ({
  level,
  message,
  timestamp: new Date().toISOString(),
  data,
});

const logger = {
  info: (message: string, data?: unknown): void => {
    console.log(JSON.stringify(formatLog("info", message, data)));
  },
  warn: (message: string, data?: unknown): void => {
    console.warn(JSON.stringify(formatLog("warn", message, data)));
  },
  error: (message: string, data?: unknown): void => {
    console.error(JSON.stringify(formatLog("error", message, data)));
  },
  debug: (message: string, data?: unknown): void => {
    if (process.env.NODE_ENV === "development") {
      console.debug(JSON.stringify(formatLog("debug", message, data)));
    }
  },
};

export default logger;
