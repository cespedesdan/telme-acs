import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { hasPermission, type Permission } from "@telme/auth";
import type {
  DeviceAuditResponse,
  DeviceDetailResponse,
  DeviceOperationResponse,
  DeviceSummaryResponse,
  DeviceInventoryResponse,
  OperationAcceptedResponse,
} from "@telme/contracts";

import {
  SessionGuard,
  type AuthenticatedRequest,
} from "../auth/session.guard.js";
import { forbidden } from "../http-errors.js";
import { DevicesService } from "./devices.service.js";

@Controller("devices")
@UseGuards(SessionGuard)
export class DevicesController {
  constructor(
    @Inject(DevicesService) private readonly devices: DevicesService,
  ) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query("q") query?: string,
  ): Promise<readonly DeviceSummaryResponse[]> {
    authorize(request, "device.read");
    return this.devices.list(query);
  }

  @Get("inventory")
  inventory(
    @Req() request: AuthenticatedRequest,
    @Query("q") query?: string,
    @Query("page") page?: string,
    @Query("state") state?: string,
  ): Promise<DeviceInventoryResponse> {
    authorize(request, "device.read");
    return this.devices.inventory(query, page ?? "1", state ?? "all");
  }

  @Put(":id/identification")
  identify(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<void> {
    authorize(request, "device.bind");
    return this.devices.identify(
      id,
      isRecord(body) ? body.localLabel : undefined,
      request.user,
    );
  }

  @Get(":id")
  detail(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<DeviceDetailResponse> {
    authorize(request, "device.read");
    return this.devices.detail(id);
  }

  @Put(":id/wifi/:band")
  updateSsid(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("band") band: string,
    @Body() body: unknown,
  ): Promise<OperationAcceptedResponse> {
    authorize(request, "wifi.write");
    return this.devices.updateSsid(
      id,
      band,
      isRecord(body) ? body.ssid : undefined,
      request.user,
      operationKey(request),
    );
  }

  @Put(":id/wifi/:band/password")
  updateWifiPassword(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("band") band: string,
    @Body() body: unknown,
  ): Promise<OperationAcceptedResponse> {
    authorize(request, "wifi.write");
    return this.devices.updateWifiPassword(
      id,
      band,
      isRecord(body) ? body.password : undefined,
      request.user,
      operationKey(request),
    );
  }

  @Post(":id/reboot")
  reboot(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<OperationAcceptedResponse> {
    authorize(request, "device.reboot");
    if (!isRecord(body) || body.confirm !== true) throw forbidden();
    return this.devices.reboot(id, request.user, operationKey(request));
  }

  @Post(":id/refresh")
  refresh(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<OperationAcceptedResponse> {
    authorize(request, "device.refresh");
    return this.devices.refresh(id, request.user, operationKey(request));
  }

  @Get(":id/operations")
  operations(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<readonly DeviceOperationResponse[]> {
    authorize(request, "device.read");
    return this.devices.operations(id);
  }

  @Get(":id/audit")
  audit(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
  ): Promise<readonly DeviceAuditResponse[]> {
    authorize(request, "audit.read");
    return this.devices.audit(id);
  }
}

function operationKey(request: AuthenticatedRequest): string {
  const value = request.headers["idempotency-key"];
  return typeof value === "string" ? value : "";
}

function authorize(
  request: AuthenticatedRequest,
  permission: Permission,
): void {
  if (!hasPermission(request.user, permission)) throw forbidden();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
