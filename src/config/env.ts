import dotenv from "dotenv";

dotenv.config();

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
}

const env: EnvConfig = {
  PORT: Number(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || "development",
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: process.env.JWT_SECRET || "",
};

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

if (!env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

export default env;
