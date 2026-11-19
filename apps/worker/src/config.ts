import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

export function loadLocalEnvironment(): void {
  const localEnv = new URL("../../../.env", import.meta.url);
  if (existsSync(localEnv)) loadEnvFile(localEnv);
}

export function readRedisUrl(value = process.env.REDIS_URL): string {
  const url = value ?? "redis://127.0.0.1:6379";
  try {
    const parsed = new URL(url);
    if (!["redis:", "rediss:"].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error("REDIS_URL must be a valid Redis URL");
  }
  return url;
}
