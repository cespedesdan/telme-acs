import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ROLE_PERMISSIONS } from "@telme/auth";
import type {
  DeviceDetailResponse,
  DeviceSummaryResponse,
  SessionUser,
} from "@telme/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuthController } from "../src/auth/auth.controller.js";
import { AuthService } from "../src/auth/auth.service.js";
import { SessionGuard } from "../src/auth/session.guard.js";
import { DevicesController } from "../src/devices/devices.controller.js";
import { DevicesService } from "../src/devices/devices.service.js";

const operator: SessionUser = {
  id: "user-1",
  email: "noc@telme.local",
  displayName: "Operador NOC",
  role: "NOC",
  isActive: true,
  permissions: ROLE_PERMISSIONS.NOC,
};

const device: DeviceDetailResponse = {
  id: "device-1",
  serialNumber: "SANITIZED-HG8145V5-LAB",
  manufacturer: "Huawei",
  model: "HG8145V5",
  softwareVersion: "V5R020C00S270",
  onlineState: "online",
  capabilities: {
    identity: "supported",
    firmware: "supported",
    wan: "supported",
    pppoeUsername: "supported",
    ipv4: "supported",
    ipv6: "unknown",
    opticalRx: "supported",
    opticalTx: "supported",
    wifi24: "supported",
    wifi5: "supported",
    wifiWrite: "supported",
    wifiPasswordWrite: "experimental",
    connectedClients: "unknown",
    reboot: "supported",
    factoryReset: "unknown",
    firmwareUpgrade: "unknown",
  },
  wifi: [
    {
      id: "wlan-1",
      band: "2.4ghz",
      ssid: "TELME-LAB",
      enabled: true,
      status: "up",
    },
  ],
};

describe("M5 operator flow", () => {
  let app: INestApplication;
  const authenticate = vi.fn(async () => operator);
  const services = {
    list: vi.fn(async (): Promise<readonly DeviceSummaryResponse[]> => [
      device,
    ]),
    detail: vi.fn(async () => device),
    updateSsid: vi.fn(async () => ({
      operationId: "operation-1",
      state: "queued" as const,
      correlationId: "correlation-1",
      genieAcsTaskId: "task-1",
    })),
    updateWifiPassword: vi.fn(async () => ({
      operationId: "operation-2",
      state: "queued" as const,
      correlationId: "correlation-2",
      genieAcsTaskId: "task-2",
    })),
    reboot: vi.fn(),
    refresh: vi.fn(),
    operations: vi.fn(async () => [
      {
        id: "operation-1",
        type: "wifi.ssid.update.2.4ghz",
        state: "queued" as const,
        correlationId: "correlation-1",
        genieAcsTaskId: "task-1",
        createdAt: "2026-08-12T12:00:00.000Z",
      },
    ]),
    audit: vi.fn(async () => [
      {
        id: "audit-1",
        action: "wifi.ssid.update",
        result: "queued",
        correlationId: "correlation-1",
        actor: operator.displayName,
        createdAt: "2026-08-12T12:00:00.000Z",
      },
    ]),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController, DevicesController],
      providers: [
        SessionGuard,
        {
          provide: AuthService,
          useValue: {
            login: vi.fn(async () => ({
              token: "signed-token",
              user: operator,
            })),
            authenticate,
          },
        },
        { provide: DevicesService, useValue: services },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("authenticates, searches, opens and queues an audited Wi-Fi write", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/session")
      .send({ email: operator.email, password: "secret" })
      .expect(201);
    const cookie = login.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("telme_session=signed-token");
    expect(cookie).toContain("HttpOnly");

    await request(app.getHttpServer())
      .get("/api/v1/devices?q=HG8145V5")
      .set("cookie", cookie)
      .expect(200)
      .expect(({ body }) => expect(body[0].model).toBe("HG8145V5"));

    await request(app.getHttpServer())
      .get("/api/v1/devices/device-1")
      .set("cookie", cookie)
      .expect(200)
      .expect(({ body }) => expect(body.wifi[0].ssid).toBe("TELME-LAB"));

    await request(app.getHttpServer())
      .put("/api/v1/devices/device-1/wifi/2.4ghz")
      .set("cookie", cookie)
      .send({ ssid: "TELME-NOVO" })
      .expect(200)
      .expect(({ body }) => expect(body.state).toBe("queued"));

    await request(app.getHttpServer())
      .put("/api/v1/devices/device-1/wifi/2.4ghz/password")
      .set("cookie", cookie)
      .send({ password: "safe-lab-password" })
      .expect(200)
      .expect(({ body }) => expect(body.state).toBe("queued"));

    await request(app.getHttpServer())
      .get("/api/v1/devices/device-1/operations")
      .set("cookie", cookie)
      .expect(200)
      .expect(({ body }) => expect(body[0].state).toBe("queued"));

    await request(app.getHttpServer())
      .get("/api/v1/devices/device-1/audit")
      .set("cookie", cookie)
      .expect(200)
      .expect(({ body }) => expect(body[0].action).toBe("wifi.ssid.update"));
  });

  it("blocks a read-only operator from changing Wi-Fi", async () => {
    const readOnlyOperator = {
      ...operator,
      role: "READ_ONLY",
      permissions: ROLE_PERMISSIONS.READ_ONLY,
    } as const;
    authenticate
      .mockResolvedValueOnce(readOnlyOperator)
      .mockResolvedValueOnce(readOnlyOperator);
    await request(app.getHttpServer())
      .put("/api/v1/devices/device-1/wifi/2.4ghz")
      .set("cookie", "telme_session=signed-token")
      .send({ ssid: "BLOCKED" })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe("FORBIDDEN_OPERATION"));

    await request(app.getHttpServer())
      .put("/api/v1/devices/device-1/wifi/2.4ghz/password")
      .set("cookie", "telme_session=signed-token")
      .send({ password: "blocked-password" })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe("FORBIDDEN_OPERATION"));
  });
});
