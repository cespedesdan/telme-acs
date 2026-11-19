import { Controller, Get, Inject, Res } from "@nestjs/common";
import { InfrastructureService } from "../infrastructure.service.js";
import type { ServiceReadinessResponse } from "@telme/contracts";

export const apiHealth = {
  service: "telme-acs-api",
  status: "ok",
} as const;

@Controller("health")
export class HealthController {
  constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
  ) {}
  @Get()
  getHealth(): typeof apiHealth {
    return apiHealth;
  }

  @Get("ready")
  async readiness(
    @Res({ passthrough: true }) response: { status(code: number): void },
  ): Promise<ServiceReadinessResponse> {
    const [database, genieAcs] = await Promise.allSettled([
      Promise.resolve().then(
        () => this.infrastructure.database.$queryRaw`SELECT 1`,
      ),
      Promise.resolve().then(() =>
        this.infrastructure.genieAcs.findDevices(
          { _id: "__telme_readiness__" },
          ["_id"],
        ),
      ),
    ]);
    const checks = {
      database:
        database.status === "fulfilled"
          ? ("ok" as const)
          : ("unavailable" as const),
      genieAcs:
        genieAcs.status === "fulfilled"
          ? ("ok" as const)
          : ("unavailable" as const),
    };
    const healthy = checks.database === "ok" && checks.genieAcs === "ok";
    response.status(healthy ? 200 : 503);
    return { status: healthy ? "ok" : "degraded", checks };
  }
}
