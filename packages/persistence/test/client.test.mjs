import assert from "node:assert/strict";
import test from "node:test";

import { USER_ROLES } from "@telme/auth";

import {
  CapabilityState,
  createPrismaClient,
  PersistenceConfigurationError,
  toDomainCapabilityState,
  toPersistenceCapabilityState,
  UserRole,
} from "../dist/index.js";

test("creates a Prisma 7 client with the PostgreSQL adapter", async () => {
  const client = createPrismaClient({
    connectionString:
      "postgresql://local_user:local_password@127.0.0.1:5432/telme_acs",
  });

  assert.equal(typeof client.$connect, "function");
  assert.equal(typeof client.device.findMany, "function");
  await client.$disconnect();
});

test("rejects invalid database configuration before opening a pool", () => {
  for (const config of [
    { connectionString: "" },
    { connectionString: "redis://127.0.0.1:6379" },
    {
      connectionString: "postgresql://127.0.0.1/telme_acs",
      maxConnections: 0,
    },
  ]) {
    assert.throws(
      () => createPrismaClient(config),
      (error) =>
        error instanceof PersistenceConfigurationError &&
        error.code === "INVALID_CONFIGURATION",
    );
  }
});

test("keeps persisted roles aligned with the authorization package", () => {
  assert.deepEqual(Object.values(UserRole), [...USER_ROLES]);
});

test("maps the normalized read-only capability without losing its meaning", () => {
  assert.equal(
    toPersistenceCapabilityState("read-only"),
    CapabilityState.read_only,
  );
  assert.equal(toDomainCapabilityState(CapabilityState.read_only), "read-only");
  assert.equal(toPersistenceCapabilityState("unknown"), "unknown");
});
