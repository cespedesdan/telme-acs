import assert from "node:assert/strict";
import test from "node:test";
import process from "node:process";
import { URL } from "node:url";

import { createPrismaClient } from "../dist/index.js";

const connectionString = process.env.TEST_DATABASE_URL;

test(
  "persists an independent device and an optional audited binding",
  {
    skip:
      connectionString === undefined ? "TEST_DATABASE_URL is not set" : false,
  },
  async () => {
    const target = new URL(connectionString);
    if (
      !target.pathname.endsWith("_test") ||
      connectionString === process.env.DATABASE_URL
    )
      throw new Error("Destructive tests require a separate _test database");
    const client = createPrismaClient({ connectionString });

    try {
      await clean(client);

      const device = await client.device.create({
        data: {
          genieAcsId: "m3-test-device-a",
          serialNumber: "SYNTHETIC-SERIAL",
          manufacturer: "TEST-ONLY",
          capabilities: {
            create: {
              name: "wifi24",
              state: "unknown",
              source: "synthetic-test",
            },
          },
        },
        include: { bindings: true, capabilities: true },
      });

      assert.equal(device.bindings.length, 0);
      assert.equal(device.capabilities[0].state, "unknown");

      await client.device.create({
        data: {
          genieAcsId: "m3-test-device-b",
          serialNumber: "SYNTHETIC-SERIAL",
        },
      });
      assert.equal(
        await client.device.count({
          where: { serialNumber: "SYNTHETIC-SERIAL" },
        }),
        2,
      );

      const actor = await client.user.create({
        data: {
          email: "m3-test@example.invalid",
          displayName: "M3 Test",
          passwordHash: "[TEST-HASH-NOT-A-CREDENTIAL]",
          role: "NOC",
        },
      });
      const externalIdentifier = await client.externalIdentifier.create({
        data: {
          system: "manual",
          entityType: "local-reference",
          value: "SYNTHETIC-REFERENCE",
        },
      });
      const operation = await client.deviceOperation.create({
        data: {
          deviceId: device.id,
          actorId: actor.id,
          type: "wifi.password.update",
          state: "queued",
          correlationId: "m3-test-correlation",
          genieAcsTaskId: "m3-test-task",
          safeRequestSummary: { password: "[REDACTED]" },
        },
      });
      await client.$transaction([
        client.deviceBinding.create({
          data: {
            deviceId: device.id,
            externalIdentifierId: externalIdentifier.id,
            method: "manual",
            createdById: actor.id,
          },
        }),
        client.auditLog.create({
          data: {
            actorId: actor.id,
            deviceId: device.id,
            externalIdentifierId: externalIdentifier.id,
            operationId: operation.id,
            action: "wifi.password.update",
            afterSummary: { password: "[REDACTED]" },
            correlationId: "m3-test-correlation",
            result: "queued",
            genieAcsTaskId: "m3-test-task",
          },
        }),
      ]);

      const persisted = await client.device.findUniqueOrThrow({
        where: { id: device.id },
        include: { bindings: true, operations: true, auditLogs: true },
      });
      assert.equal(persisted.bindings.length, 1);
      assert.equal(persisted.operations[0].state, "queued");
      assert.deepEqual(persisted.auditLogs[0].afterSummary, {
        password: "[REDACTED]",
      });
    } finally {
      await clean(client);
      await client.$disconnect();
    }
  },
);

async function clean(client) {
  await client.auditLog.deleteMany();
  await client.deviceBinding.deleteMany();
  await client.deviceOperation.deleteMany();
  await client.deviceCapability.deleteMany();
  await client.externalIdentifier.deleteMany();
  await client.device.deleteMany();
  await client.user.deleteMany();
}
