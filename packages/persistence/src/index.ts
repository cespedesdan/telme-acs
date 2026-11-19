import { PrismaPg } from "@prisma/adapter-pg";
import type { CapabilityState as DomainCapabilityState } from "@telme/device-model";

import { CapabilityState, PrismaClient } from "./generated/prisma/client.js";

export {
  CapabilityState,
  DeviceBindingMethod,
  DeviceOnlineState,
  DeviceOperationState,
  Prisma,
  PrismaClient,
  UserRole,
} from "./generated/prisma/client.js";

export interface PersistenceConfig {
  connectionString: string;
  connectionTimeoutMs?: number;
  maxConnections?: number;
}

export class PersistenceConfigurationError extends Error {
  public readonly code = "INVALID_CONFIGURATION";

  public constructor(message: string) {
    super(message);
    this.name = "PersistenceConfigurationError";
  }
}

export function createPrismaClient({
  connectionString,
  connectionTimeoutMs = 5_000,
  maxConnections = 10,
}: PersistenceConfig): PrismaClient {
  validateConnectionString(connectionString);
  requirePositiveInteger(connectionTimeoutMs, "connectionTimeoutMs");
  requirePositiveInteger(maxConnections, "maxConnections");

  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: connectionTimeoutMs,
    max: maxConnections,
  });
  return new PrismaClient({ adapter });
}

export function toPersistenceCapabilityState(
  state: DomainCapabilityState,
): CapabilityState {
  return state === "read-only" ? CapabilityState.read_only : state;
}

export function toDomainCapabilityState(
  state: CapabilityState,
): DomainCapabilityState {
  return state === CapabilityState.read_only ? "read-only" : state;
}

function validateConnectionString(value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
      throw new TypeError();
    }
  } catch {
    throw new PersistenceConfigurationError(
      "DATABASE_URL must be a valid PostgreSQL URL.",
    );
  }
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new PersistenceConfigurationError(
      `${name} must be a positive integer.`,
    );
  }
}
