import { execFileSync } from "node:child_process";

export default function setup(): void {
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST },
  });
}
