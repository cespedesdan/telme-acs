import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

const localEnvFile = new URL("../../../.env", import.meta.url);

export function loadLocalEnvironment(): void {
  if (existsSync(localEnvFile)) loadEnvFile(localEnvFile);
}

export function readPort(value = process.env.API_PORT): number {
  const port = Number(value ?? 3101);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }

  return port;
}
