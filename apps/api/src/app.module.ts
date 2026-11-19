import { Module } from "@nestjs/common";

import { HealthController } from "./health/health.controller.js";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { SessionGuard } from "./auth/session.guard.js";
import { DevicesController } from "./devices/devices.controller.js";
import { DevicesService } from "./devices/devices.service.js";
import { InfrastructureService } from "./infrastructure.service.js";
import { OperationsService } from "./devices/operations.service.js";

@Module({
  controllers: [HealthController, AuthController, DevicesController],
  providers: [
    InfrastructureService,
    AuthService,
    SessionGuard,
    DevicesService,
    OperationsService,
  ],
})
export class AppModule {}
