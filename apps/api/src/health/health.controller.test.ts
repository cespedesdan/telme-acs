import { describe, expect, it, vi } from "vitest";

import { apiHealth, HealthController } from "./health.controller.js";
import type { InfrastructureService } from "../infrastructure.service.js";

describe("HealthController", () => {
  it("reports the API as healthy", () => {
    expect(
      new HealthController({} as InfrastructureService).getHealth(),
    ).toEqual(apiHealth);
  });

  it("reports database and ACS availability separately", async () => {
    const controller = new HealthController({
      database: { $queryRaw: vi.fn(async () => []) },
      genieAcs: {
        findDevices: vi.fn(async () => {
          throw new Error("unavailable");
        }),
      },
    } as unknown as InfrastructureService);
    const status = vi.fn();
    expect(await controller.readiness({ status })).toEqual({
      status: "degraded",
      checks: { database: "ok", genieAcs: "unavailable" },
    });
    expect(status).toHaveBeenCalledWith(503);
  });
});
