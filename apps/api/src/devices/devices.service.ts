import { Inject, Injectable } from "@nestjs/common";
import type { SessionUser } from "@telme/contracts";
import type {
  DeviceAuditResponse,
  DeviceDetailResponse,
  DeviceOperationResponse,
  DeviceSummaryResponse,
  DeviceInventoryResponse,
  OperationAcceptedResponse,
} from "@telme/contracts";
import {
  adapterRegistry,
  createAdapterContextFromGenieAcs,
  GENIEACS_IDENTITY_PROJECTION,
  type DeviceAdapter,
  type DeviceAdapterContext,
  type WifiBand,
} from "@telme/device-adapters";
import {
  toDomainCapabilityState,
  toPersistenceCapabilityState,
  type Prisma,
} from "@telme/persistence";
import { randomUUID } from "node:crypto";
import { classifyDeviceContact } from "@telme/device-model";
import { OperationsService } from "./operations.service.js";

import {
  badRequest,
  capabilityUnknown,
  notFound,
  upstreamUnavailable,
} from "../http-errors.js";
import { InfrastructureService } from "../infrastructure.service.js";

const DEVICE_PROJECTION = [
  "_id",
  "_lastInform",
  "_lastBoot",
  "_deviceId",
  ...GENIEACS_IDENTITY_PROJECTION,
  ...adapterRegistry.parameterPaths,
] as const;

@Injectable()
export class DevicesService {
  private syncInProgress: Promise<void> | undefined;
  private lastSyncAttempt = 0;
  private lastSyncedAt?: Date;
  private syncState: "current" | "unavailable" = "unavailable";
  constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
    @Inject(OperationsService)
    private readonly operationService: OperationsService,
  ) {}

  async list(searchValue: unknown): Promise<readonly DeviceSummaryResponse[]> {
    return (await this.inventory(searchValue)).items;
  }

  async inventory(
    searchValue: unknown,
    pageValue: unknown = "1",
    filterValue: unknown = "all",
  ): Promise<DeviceInventoryResponse> {
    const search = parseSearch(searchValue);
    const page = Number(pageValue);
    if (!Number.isInteger(page) || page < 1 || page > 100000)
      throw badRequest("INVALID_PAGE", "Página inválida.");
    if (
      !["all", "online", "offline", "attention"].includes(String(filterValue))
    )
      throw badRequest("INVALID_FILTER", "Filtro inválido.");
    await this.ensureSync();
    const where: Prisma.DeviceWhereInput = {
      ...(filterValue === "attention"
        ? {
            onlineState: {
              in: ["stale", "unknown"] as ("stale" | "unknown")[],
            },
          }
        : filterValue === "online" || filterValue === "offline"
          ? { onlineState: filterValue }
          : {}),
      ...(search
        ? {
            OR: [
              "serialNumber",
              "macAddress",
              "pppoeUsername",
              "model",
              "productClass",
              "manufacturer",
              "genieAcsId",
              "localLabel",
            ].map((field) => ({
              [field]: { contains: search, mode: "insensitive" as const },
            })),
          }
        : {}),
    };
    const now = Date.now();
    const onlineBefore = new Date(now - contactWindows().online);
    const offlineBefore = new Date(now - contactWindows().offline);
    await this.infrastructure.database.$transaction([
      this.infrastructure.database.device.updateMany({
        where: { lastInformAt: null, onlineState: { not: "unknown" } },
        data: { onlineState: "unknown" },
      }),
      this.infrastructure.database.device.updateMany({
        where: {
          lastInformAt: { gte: onlineBefore },
          onlineState: { not: "online" },
        },
        data: { onlineState: "online" },
      }),
      this.infrastructure.database.device.updateMany({
        where: {
          lastInformAt: { lt: onlineBefore, gte: offlineBefore },
          onlineState: { not: "stale" },
        },
        data: { onlineState: "stale" },
      }),
      this.infrastructure.database.device.updateMany({
        where: {
          lastInformAt: { lt: offlineBefore },
          onlineState: { not: "offline" },
        },
        data: { onlineState: "offline" },
      }),
    ]);
    const [total, groups] = await Promise.all([
      this.infrastructure.database.device.count({ where }),
      this.infrastructure.database.device.groupBy({
        by: ["onlineState"],
        _count: true,
      }),
    ]);
    const devices = await this.infrastructure.database.device.findMany({
      where,
      include: { capabilities: true },
      orderBy: [
        { lastInformAt: "desc" },
        { serialNumber: "asc" },
        { id: "asc" },
      ],
      take: 50,
      skip: (page - 1) * 50,
    });
    const metrics = { total: 0, online: 0, stale: 0, offline: 0, unknown: 0 };
    for (const group of groups) {
      metrics[group.onlineState] = group._count;
      metrics.total += group._count;
    }
    return {
      items: devices.map(toSummary),
      total,
      page,
      pageSize: 50,
      metrics,
      syncState: this.syncState,
      ...(this.lastSyncedAt
        ? { lastSyncedAt: this.lastSyncedAt.toISOString() }
        : {}),
    };
  }

  async detail(id: string): Promise<DeviceDetailResponse> {
    const { local, context, adapter } = await this.loadLiveDevice(id);
    const normalized = adapter.normalize(context);
    const wifiUnifiedSsid = adapter.readWifiUnifiedSsid?.(context);
    return {
      ...toSummary(local),
      ...context.identity,
      capabilities: adapter.capabilities,
      ...(normalized.lastInformAt
        ? { lastInformAt: normalized.lastInformAt.toISOString() }
        : {}),
      onlineState: classifyDeviceContact(
        normalized.lastInformAt,
        new Date(),
        contactWindows().online,
        contactWindows().offline,
      ),
      ...(normalized.wan === undefined ? {} : { wan: normalized.wan }),
      ...(normalized.optical === undefined
        ? {}
        : { optical: normalized.optical }),
      ...(wifiUnifiedSsid === undefined ? {} : { wifiUnifiedSsid }),
      wifi: adapter.readWifi?.(context) ?? [],
      ...(adapter.readWifiClients === undefined
        ? {}
        : { wifiClients: adapter.readWifiClients(context) }),
    };
  }

  async updateSsid(
    id: string,
    bandValue: string,
    ssidValue: unknown,
    actor: SessionUser,
    key: string,
  ): Promise<OperationAcceptedResponse> {
    const band = parseBand(bandValue);
    const ssid = parseSsid(ssidValue);
    const previous = await this.operationService.replay({
      key,
      actor,
      deviceId: id,
      type: `wifi.ssid.update.${band}`,
      payload: { band, ssid },
    });
    if (previous) return previous;
    const live = await this.loadLiveDevice(id);
    if (
      live.adapter.capabilities.wifiWrite !== "supported" ||
      !live.adapter.buildWifiSsidWrite
    ) {
      throw capabilityUnknown();
    }
    let writes;
    try {
      writes = live.adapter.buildWifiSsidWrite(band, ssid);
    } catch (error) {
      throw badRequest(
        "INVALID_WIFI_CONFIGURATION",
        error instanceof Error ? error.message : "SSID inválido.",
      );
    }
    return this.operationService.submit({
      key,
      payload: { band, ssid },
      actor,
      deviceId: live.local.id,
      type: `wifi.ssid.update.${band}`,
      action: "wifi.ssid.update",
      safeSummary: { band, ssid: "[REDACTED]" },
      beforeSummary: { band, ssid: "[REDACTED]" },
      verification: {
        kind: "ssid",
        band,
        paths: writes.map(([path]) => path),
        expectedHash: this.operationService.fingerprint(
          writes.map(([, value]) => value),
        ),
      },
      run: (expiresAt) =>
        this.infrastructure.genieAcs.setParameterValues(
          live.local.genieAcsId,
          writes,
          { expiresAt },
        ),
    });
  }

  async updateWifiPassword(
    id: string,
    bandValue: string,
    passwordValue: unknown,
    actor: SessionUser,
    key: string,
  ): Promise<OperationAcceptedResponse> {
    const band = parseBand(bandValue);
    const password = parseWifiPassword(passwordValue);
    const previous = await this.operationService.replay({
      key,
      actor,
      deviceId: id,
      type: `wifi.password.update.${band}`,
      payload: { band, password },
    });
    if (previous) return previous;
    const live = await this.loadLiveDevice(id);
    if (
      live.adapter.capabilities.wifiPasswordWrite !== "supported" ||
      !live.adapter.buildWifiPasswordWrite
    ) {
      throw capabilityUnknown();
    }
    let writes;
    try {
      writes = live.adapter.buildWifiPasswordWrite(band, password);
    } catch (error) {
      throw badRequest(
        "INVALID_WIFI_CONFIGURATION",
        error instanceof Error ? error.message : "Senha Wi-Fi inválida.",
      );
    }
    return this.operationService.submit({
      key,
      payload: { band, password },
      actor,
      deviceId: live.local.id,
      type: `wifi.password.update.${band}`,
      action: "wifi.password.update",
      safeSummary: { band, password: "[REDACTED]" },
      beforeSummary: { band, password: "[REDACTED]" },
      verification: { kind: "unverifiable" },
      run: (expiresAt) =>
        this.infrastructure.genieAcs.setParameterValues(
          live.local.genieAcsId,
          writes,
          { expiresAt },
        ),
    });
  }

  async reboot(
    id: string,
    actor: SessionUser,
    key: string,
  ): Promise<OperationAcceptedResponse> {
    const previous = await this.operationService.replay({
      key,
      actor,
      deviceId: id,
      type: "device.reboot",
      payload: { confirm: true },
    });
    if (previous) return previous;
    const live = await this.loadLiveDevice(id);
    if (live.adapter.capabilities.reboot !== "supported") {
      throw capabilityUnknown();
    }
    return this.operationService.submit({
      key,
      payload: { confirm: true },
      actor,
      deviceId: live.local.id,
      type: "device.reboot",
      action: "device.reboot",
      safeSummary: { confirmation: true },
      verification: {
        kind: "reboot",
        ...(typeof live.upstream.raw._lastBoot === "string"
          ? { baselineBoot: live.upstream.raw._lastBoot }
          : {}),
      },
      run: (expiresAt) =>
        this.infrastructure.genieAcs.reboot(live.local.genieAcsId, {
          expiresAt,
        }),
    });
  }

  async refresh(
    id: string,
    actor: SessionUser,
    key: string,
  ): Promise<OperationAcceptedResponse> {
    const previous = await this.operationService.replay({
      key,
      actor,
      deviceId: id,
      type: "device.refresh",
      payload: {},
    });
    if (previous) return previous;
    const live = await this.loadLiveDevice(id);
    const paths = [
      ...new Set([
        ...(live.adapter.parameterPaths ?? []),
        ...GENIEACS_IDENTITY_PROJECTION,
      ]),
    ].filter((path) => Object.hasOwn(live.context.parameters, path));
    if (paths.length === 0) throw capabilityUnknown();
    return this.operationService.submit({
      key,
      payload: {},
      actor,
      deviceId: live.local.id,
      type: "device.refresh",
      action: "device.refresh",
      safeSummary: { scope: "verified-parameters" },
      verification: { kind: "refresh", paths },
      run: (expiresAt) =>
        this.infrastructure.genieAcs.refreshParameters(
          live.local.genieAcsId,
          paths,
          { expiresAt },
        ),
    });
  }

  async operations(id: string): Promise<readonly DeviceOperationResponse[]> {
    await this.requireLocalDevice(id);
    return this.operationService.list(id);
  }

  async audit(id: string): Promise<readonly DeviceAuditResponse[]> {
    await this.requireLocalDevice(id);
    const entries = await this.infrastructure.database.auditLog.findMany({
      where: { deviceId: id },
      include: { actor: { select: { displayName: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      result: entry.result,
      correlationId: entry.correlationId,
      ...(entry.actor === null ? {} : { actor: entry.actor.displayName }),
      createdAt: entry.createdAt.toISOString(),
    }));
  }

  private async syncDevices(): Promise<void> {
    let devices;
    try {
      devices = await this.infrastructure.genieAcs.findDevices(
        { _id: { $ne: null } },
        DEVICE_PROJECTION,
      );
    } catch {
      throw upstreamUnavailable();
    }

    for (const device of devices) {
      let context: DeviceAdapterContext;
      try {
        context = createAdapterContextFromGenieAcs(device.raw);
      } catch {
        continue;
      }
      const adapter = adapterRegistry.resolve(context.identity);
      const normalized = adapter.normalize(context);
      const windows = contactWindows();
      normalized.onlineState = classifyDeviceContact(
        normalized.lastInformAt,
        new Date(),
        windows.online,
        windows.offline,
      );
      const persisted = await this.infrastructure.database.device.upsert({
        where: { genieAcsId: device.id },
        create: persistenceDevice(device.id, normalized),
        update: persistenceDevice(device.id, normalized),
      });
      for (const [name, state] of Object.entries(adapter.capabilities)) {
        await this.infrastructure.database.deviceCapability.upsert({
          where: { deviceId_name: { deviceId: persisted.id, name } },
          create: {
            deviceId: persisted.id,
            name,
            state: toPersistenceCapabilityState(state),
            source: adapter.id,
            evidence: evidence(context) ?? null,
          },
          update: {
            state: toPersistenceCapabilityState(state),
            source: adapter.id,
            evidence: evidence(context) ?? null,
          },
        });
      }
    }
  }

  private async ensureSync(): Promise<void> {
    if (this.syncInProgress) return this.syncInProgress;
    // One API process shares this sync; use a Redis lock for multiple replicas.
    if (Date.now() - this.lastSyncAttempt < 60000) return;
    this.lastSyncAttempt = Date.now();
    this.syncInProgress = this.syncDevices()
      .then(() => {
        this.lastSyncedAt = new Date();
        this.syncState = "current";
      })
      .catch(() => {
        this.syncState = "unavailable";
      })
      .finally(() => {
        this.syncInProgress = undefined;
      });
    return this.syncInProgress;
  }

  async identify(
    id: string,
    labelValue: unknown,
    actor: SessionUser,
  ): Promise<void> {
    if (
      typeof labelValue !== "string" ||
      labelValue.length > 120 ||
      Array.from(labelValue).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      throw badRequest("INVALID_LABEL", "Identificação inválida.");
    const device = await this.requireLocalDevice(id);
    const label = labelValue.trim();
    await this.infrastructure.database.$transaction(async (database) => {
      await database.device.update({
        where: { id },
        data: { localLabel: label || null },
      });
      await database.auditLog.create({
        data: {
          deviceId: id,
          actorId: actor.id,
          action: "device.identification.update",
          correlationId: randomUUID(),
          result: "executed",
          beforeSummary: { localLabel: device.localLabel },
          afterSummary: { localLabel: label },
        },
      });
    });
  }

  private async loadLiveDevice(id: string) {
    const local = await this.requireLocalDevice(id);
    let upstream;
    try {
      upstream = await this.infrastructure.genieAcs.getDevice(
        local.genieAcsId,
        DEVICE_PROJECTION,
      );
    } catch {
      throw upstreamUnavailable();
    }
    if (!upstream) throw notFound();
    const context = createAdapterContextFromGenieAcs(upstream.raw);
    return {
      upstream,
      local,
      context,
      adapter: adapterRegistry.resolve(context.identity),
    };
  }

  private async requireLocalDevice(id: string) {
    const device = await this.infrastructure.database.device.findUnique({
      where: { id },
      include: { capabilities: true },
    });
    if (!device) throw notFound();
    return device;
  }
}

function persistenceDevice(
  genieAcsId: string,
  normalized: ReturnType<DeviceAdapter["normalize"]>,
) {
  return {
    genieAcsId,
    serialNumber: normalized.serialNumber,
    ...(normalized.manufacturer === undefined
      ? {}
      : { manufacturer: normalized.manufacturer }),
    ...(normalized.model === undefined ? {} : { model: normalized.model }),
    ...(normalized.productClass === undefined
      ? {}
      : { productClass: normalized.productClass }),
    ...(normalized.oui === undefined ? {} : { oui: normalized.oui }),
    ...(normalized.hardwareVersion === undefined
      ? {}
      : { hardwareVersion: normalized.hardwareVersion }),
    ...(normalized.softwareVersion === undefined
      ? {}
      : { softwareVersion: normalized.softwareVersion }),
    ...(normalized.wan?.pppoeUsername === undefined
      ? {}
      : { pppoeUsername: normalized.wan.pppoeUsername }),
    onlineState: normalized.onlineState,
    ...(normalized.lastInformAt === undefined
      ? {}
      : { lastInformAt: normalized.lastInformAt }),
  };
}

function evidence(context: DeviceAdapterContext): string | undefined {
  const values = [
    context.identity.hardwareVersion,
    context.identity.softwareVersion,
  ].filter((value): value is string => value !== undefined);
  return values.length === 0 ? undefined : values.join(" / ");
}

function toSummary(device: {
  id: string;
  serialNumber: string;
  manufacturer: string | null;
  model: string | null;
  productClass: string | null;
  hardwareVersion: string | null;
  softwareVersion: string | null;
  lastInformAt: Date | null;
  onlineState: "online" | "stale" | "offline" | "unknown";
  capabilities: readonly {
    name: string;
    state: Parameters<typeof toDomainCapabilityState>[0];
  }[];
  localLabel?: string | null;
  macAddress?: string | null;
  pppoeUsername?: string | null;
}): DeviceSummaryResponse {
  const capabilities = Object.fromEntries(
    device.capabilities.map(({ name, state }) => [
      name,
      toDomainCapabilityState(state),
    ]),
  ) as DeviceSummaryResponse["capabilities"];
  return {
    id: device.id,
    serialNumber: device.serialNumber,
    ...(device.manufacturer === null
      ? {}
      : { manufacturer: device.manufacturer }),
    ...(device.model === null ? {} : { model: device.model }),
    ...(device.productClass === null
      ? {}
      : { productClass: device.productClass }),
    ...(device.hardwareVersion === null
      ? {}
      : { hardwareVersion: device.hardwareVersion }),
    ...(device.softwareVersion === null
      ? {}
      : { softwareVersion: device.softwareVersion }),
    ...(device.lastInformAt === null
      ? {}
      : { lastInformAt: device.lastInformAt.toISOString() }),
    onlineState: device.onlineState,
    capabilities,
    ...(device.localLabel ? { localLabel: device.localLabel } : {}),
    ...(device.macAddress ? { macAddress: device.macAddress } : {}),
    ...(device.pppoeUsername ? { pppoeUsername: device.pppoeUsername } : {}),
  };
}

function contactWindows(): { online: number; offline: number } {
  const online = Number(process.env.DEVICE_ONLINE_WINDOW_SECONDS ?? 300) * 1000;
  const offline =
    Number(process.env.DEVICE_OFFLINE_WINDOW_SECONDS ?? 86400) * 1000;
  if (
    !Number.isFinite(online) ||
    !Number.isFinite(offline) ||
    online <= 0 ||
    offline <= online
  )
    throw new Error("Invalid device contact windows");
  return { online, offline };
}

function parseSearch(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > 100) {
    throw badRequest("INVALID_SEARCH", "Busca inválida.");
  }
  return value.trim() || undefined;
}

function parseBand(value: string): WifiBand {
  if (value !== "2.4ghz" && value !== "5ghz") {
    throw badRequest("INVALID_WIFI_BAND", "Banda Wi-Fi inválida.");
  }
  return value;
}

function parseSsid(value: unknown): string {
  if (typeof value !== "string") {
    throw badRequest("INVALID_WIFI_CONFIGURATION", "SSID inválido.");
  }
  return value;
}

function parseWifiPassword(value: unknown): string {
  if (typeof value !== "string") {
    throw badRequest("INVALID_WIFI_CONFIGURATION", "Senha Wi-Fi inválida.");
  }
  return value;
}
