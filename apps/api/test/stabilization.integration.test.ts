import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { hashPassword } from "@telme/auth";
import { createPrismaClient } from "@telme/persistence";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthController } from "../src/auth/auth.controller.js";
import { AuthService } from "../src/auth/auth.service.js";
import { SessionGuard } from "../src/auth/session.guard.js";
import { DevicesController } from "../src/devices/devices.controller.js";
import { DevicesService } from "../src/devices/devices.service.js";
import { OperationsService } from "../src/devices/operations.service.js";
import { InfrastructureService } from "../src/infrastructure.service.js";

const connectionString = process.env.TEST_DATABASE_URL;
describe.skipIf(!connectionString)(
  "real persistence with a simulated ACS",
  () => {
    let app: INestApplication;
    let database: ReturnType<typeof createPrismaClient>;
    let cookie: string;
    let deviceId: string;
    let operations: OperationsService;
    const email = `stabilization-${randomUUID()}@example.invalid`;
    const ssidPath =
      "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID";
    let raw: Record<string, unknown>;
    let readbackTimestamp: string;
    const setParameterValues = vi.fn(async () => ({
      state: "queued",
      taskId: "simulated-write-task",
    }));
    const genieAcs = {
      findDevices: vi.fn(async () => [
        { id: "synthetic-stabilization-cpe", raw },
      ]),
      getDevice: vi.fn(async () => ({
        id: "synthetic-stabilization-cpe",
        raw,
      })),
      setParameterValues,
      getTask: vi.fn(async () => undefined),
      hasTaskFault: vi.fn(async () => false),
      refreshParameters: vi.fn(async () => {
        readbackTimestamp = new Date(Date.now() + 1000).toISOString();
        return { state: "queued", taskId: "simulated-readback-task" };
      }),
      deleteTask: vi.fn(async () => undefined),
    };

    beforeAll(async () => {
      if (
        !connectionString ||
        !new URL(connectionString).pathname.endsWith("_test") ||
        connectionString === process.env.DATABASE_URL
      )
        throw new Error("Use a separate _test database");
      process.env.NODE_ENV = "test";
      process.env.SESSION_SECRET =
        "synthetic-stabilization-test-session-secret";
      database = createPrismaClient({ connectionString });
      const fixture = JSON.parse(
        await readFile(
          new URL(
            "../../../packages/device-adapters/test/fixtures/huawei/hg8145v5/15ad-a-v5r020c00s270.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ) as { parameters: Record<string, unknown> };
      raw = {
        _id: "synthetic-stabilization-cpe",
        _deviceId: { _SerialNumber: "SYNTHETIC-STABILIZATION" },
        _lastInform: new Date().toISOString(),
        ...fixture.parameters,
      };
      await database.user.create({
        data: {
          email,
          displayName: "Synthetic Operator",
          passwordHash: await hashPassword("synthetic-only-password"),
          role: "ADMIN",
        },
      });
      const module = await Test.createTestingModule({
        controllers: [AuthController, DevicesController],
        providers: [
          AuthService,
          SessionGuard,
          DevicesService,
          OperationsService,
          { provide: InfrastructureService, useValue: { database, genieAcs } },
        ],
      }).compile();
      operations = module.get(OperationsService);
      app = module.createNestApplication();
      app.setGlobalPrefix("api/v1");
      await app.init();
    });

    afterAll(async () => {
      if (app) await app.close();
      if (database) await database.$disconnect();
    });

    it("logs in and calculates fleet totals independently of the first 50 devices", async () => {
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/session")
        .send({ email, password: "synthetic-only-password" })
        .expect(201);
      cookie = login.headers["set-cookie"]![0]!;
      await database.device.createMany({
        data: Array.from({ length: 51 }, (_, i) => ({
          genieAcsId: `synthetic-pagination-${i}`,
          serialNumber: `SYNTHETIC-${i}`,
        })),
      });
      const inventory = await request(app.getHttpServer())
        .get("/api/v1/devices/inventory")
        .set("cookie", cookie)
        .expect(200);
      expect(inventory.body.items).toHaveLength(50);
      expect(inventory.body.total).toBe(52);
      expect(inventory.body.metrics.total).toBe(52);
      deviceId = (
        await database.device.findUniqueOrThrow({
          where: { genieAcsId: "synthetic-stabilization-cpe" },
        })
      ).id;
      await request(app.getHttpServer())
        .get("/api/v1/devices/inventory?page=2")
        .set("cookie", cookie)
        .expect(200)
        .expect(({ body }) => expect(body.items).toHaveLength(2));
    });

    it("audits and deduplicates writes, then confirms a separate fresh readback", async () => {
      setParameterValues.mockImplementationOnce(async () => {
        expect(
          await database.auditLog.count({
            where: { deviceId, result: "requested" },
          }),
        ).toBe(1);
        return { state: "queued", taskId: "simulated-write-task" };
      });
      const key = randomUUID();
      const put = () =>
        request(app.getHttpServer())
          .put(`/api/v1/devices/${deviceId}/wifi/2.4ghz`)
          .set("cookie", cookie)
          .set("idempotency-key", key)
          .send({ ssid: "SYNTHETIC-NEW" });
      const first = await put().expect(200);
      const second = await put().expect(200);
      expect(first.body.operationId).toBe(second.body.operationId);
      expect(setParameterValues).toHaveBeenCalledTimes(1);
      expect(
        await database.deviceOperation.count({ where: { deviceId } }),
      ).toBe(1);
      await operations.reconcile(deviceId);
      raw[ssidPath] = {
        _value: "SYNTHETIC-NEW",
        _timestamp: readbackTimestamp,
      };
      await operations.reconcile(deviceId);
      expect(
        (
          await database.deviceOperation.findUniqueOrThrow({
            where: { id: first.body.operationId },
          })
        ).state,
      ).toBe("executed");
      await request(app.getHttpServer())
        .put(`/api/v1/devices/${deviceId}/wifi/2.4ghz`)
        .set("cookie", cookie)
        .set("idempotency-key", key)
        .send({ ssid: "DIFFERENT" })
        .expect(409);
    });

    it("searches audited manual labels and blocks read-only mutations", async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/devices/${deviceId}/identification`)
        .set("cookie", cookie)
        .send({ localLabel: "Laboratório sintético" })
        .expect(200);
      await request(app.getHttpServer())
        .get("/api/v1/devices/inventory?q=Laborat%C3%B3rio")
        .set("cookie", cookie)
        .expect(200)
        .expect(({ body }) => expect(body.total).toBe(1));
      await database.user.update({
        where: { email },
        data: { role: "READ_ONLY" },
      });
      await request(app.getHttpServer())
        .put(`/api/v1/devices/${deviceId}/wifi/2.4ghz`)
        .set("cookie", cookie)
        .set("idempotency-key", randomUUID())
        .send({ ssid: "BLOCKED" })
        .expect(403);
      expect(setParameterValues).toHaveBeenCalledTimes(1);
    });
  },
);
