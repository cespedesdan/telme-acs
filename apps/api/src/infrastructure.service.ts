import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { GenieAcsClient } from "@telme/genieacs-client";
import { createPrismaClient, type PrismaClient } from "@telme/persistence";

@Injectable()
export class InfrastructureService implements OnModuleDestroy {
  private databaseClient?: PrismaClient;
  private genieAcsClient?: GenieAcsClient;

  get database(): PrismaClient {
    this.databaseClient ??= createPrismaClient({
      connectionString: requireEnvironment("DATABASE_URL"),
    });
    return this.databaseClient;
  }

  get genieAcs(): GenieAcsClient {
    this.genieAcsClient ??= new GenieAcsClient({
      baseUrl: process.env.GENIEACS_NBI_URL ?? "http://127.0.0.1:7557",
      requestTimeoutMs: readPositiveInteger(
        process.env.GENIEACS_REQUEST_TIMEOUT_MS,
        10_000,
      ),
      ...optionalCredentials(
        process.env.GENIEACS_NBI_USERNAME,
        process.env.GENIEACS_NBI_PASSWORD,
      ),
    });
    return this.genieAcsClient;
  }

  async onModuleDestroy(): Promise<void> {
    await this.databaseClient?.$disconnect();
  }
}

export function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("GENIEACS_REQUEST_TIMEOUT_MS must be a positive integer.");
  }
  return parsed;
}

function optionalCredentials(
  username: string | undefined,
  password: string | undefined,
): { username: string; password: string } | Record<string, never> {
  return username && password ? { username, password } : {};
}
