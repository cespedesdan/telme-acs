import {
  Inject,
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { createHmac } from "node:crypto";
import type {
  SessionUser,
  OperationAcceptedResponse,
  DeviceOperationResponse,
} from "@telme/contracts";
import {
  GenieAcsError,
  type GenieAcsOperationResult,
} from "@telme/genieacs-client";
import { adapterRegistry, type WifiBand } from "@telme/device-adapters";
import {
  InfrastructureService,
  requireEnvironment,
} from "../infrastructure.service.js";
import { badRequest, operationConflict } from "../http-errors.js";

interface Verification {
  kind: "ssid" | "refresh" | "reboot" | "unverifiable";
  paths?: string[];
  band?: WifiBand;
  expectedHash?: string;
  baselineBoot?: string;
}

interface Mutation {
  actor: SessionUser;
  deviceId: string;
  key: string;
  type: string;
  action: string;
  payload: unknown;
  safeSummary: Record<string, string | boolean>;
  beforeSummary?: Record<string, string | boolean>;
  verification: Verification;
  run: (expiresAt: Date) => Promise<GenieAcsOperationResult>;
}

@Injectable()
export class OperationsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private reconciling: Promise<void> | undefined;

  constructor(
    @Inject(InfrastructureService)
    private readonly infrastructure: InfrastructureService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      void this.reconcile().catch(() =>
        console.warn("Operation reconciliation temporarily unavailable"),
      );
    }, 15_000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.reconciling?.catch(() => undefined);
  }

  fingerprint(value: unknown): string {
    return createHmac("sha256", requireEnvironment("SESSION_SECRET"))
      .update(JSON.stringify(value))
      .digest("hex");
  }

  async replay(
    input: Pick<Mutation, "key" | "actor" | "deviceId" | "type" | "payload">,
  ): Promise<OperationAcceptedResponse | undefined> {
    validateKey(input.key);
    const existing =
      await this.infrastructure.database.deviceOperation.findUnique({
        where: { correlationId: input.key },
      });
    if (!existing) return undefined;
    if (
      existing.actorId !== input.actor.id ||
      existing.deviceId !== input.deviceId ||
      existing.type !== input.type ||
      existing.requestFingerprint !== this.fingerprint(input.payload)
    )
      throw operationConflict();
    return accepted(existing);
  }

  async submit(input: Mutation): Promise<OperationAcceptedResponse> {
    const previous = await this.replay(input);
    if (previous) return previous;
    const expiresAt = new Date(Date.now() + operationLifetimeMs());
    let operation;
    try {
      operation = await this.infrastructure.database.$transaction(
        async (database) => {
          const row = await database.deviceOperation.create({
            data: {
              deviceId: input.deviceId,
              actorId: input.actor.id,
              type: input.type,
              state: "queued",
              correlationId: input.key,
              errorCode: "DISPATCH_PENDING",
              safeRequestSummary: input.safeSummary,
              requestFingerprint: this.fingerprint(input.payload),
              verification: { ...input.verification },
              expiresAt,
            },
          });
          await database.auditLog.create({
            data: {
              actorId: input.actor.id,
              deviceId: input.deviceId,
              operationId: row.id,
              action: input.action,
              correlationId: input.key,
              result: "requested",
              afterSummary: input.safeSummary,
              ...(input.beforeSummary
                ? { beforeSummary: input.beforeSummary }
                : {}),
            },
          });
          return row;
        },
      );
    } catch (error) {
      if (isRecord(error) && error.code === "P2002") {
        const replay = await this.replay(input);
        if (replay) return replay;
      }
      throw error; // A database failure must stop dispatch.
    }

    let result: GenieAcsOperationResult;
    try {
      result = await input.run(expiresAt);
    } catch (error) {
      // A lost response may hide an accepted task. Never retry automatically.
      const code =
        error instanceof GenieAcsError ? error.code : "DISPATCH_UNCERTAIN";
      const rejected =
        code === "FORBIDDEN_OPERATION" ||
        code === "DEVICE_NOT_FOUND" ||
        code === "INVALID_REQUEST";
      return accepted(
        await this.finish(
          operation.id,
          rejected ? "failed" : "queued",
          rejected ? code : "DISPATCH_UNCERTAIN",
        ),
      );
    }
    const terminal = result.state === "failed";
    const uncertain = result.state === "timed_out";
    // Even an immediate RPC acknowledgement requires separate physical evidence.
    return accepted(
      await this.finish(
        operation.id,
        terminal ? "failed" : "queued",
        terminal ? "OPERATION_FAILED" : uncertain ? "DISPATCH_UNCERTAIN" : null,
        result.taskId,
      ),
    );
  }

  async list(deviceId: string): Promise<readonly DeviceOperationResponse[]> {
    // NBI checks run independently; a slow CPE must not block history reads.
    void this.reconcile(deviceId).catch(() => undefined);
    const rows = await this.infrastructure.database.deviceOperation.findMany({
      where: { deviceId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map((row) => ({
      ...accepted(row),
      id: row.id,
      type: row.type,
      createdAt: row.createdAt.toISOString(),
      ...(row.errorCode ? { errorCode: row.errorCode } : {}),
      ...(row.completedAt
        ? { completedAt: row.completedAt.toISOString() }
        : {}),
    }));
  }

  async reconcile(deviceId?: string): Promise<void> {
    if (this.reconciling) return this.reconciling;
    const run = this.reconcileBatch(deviceId);
    this.reconciling = run;
    try {
      await run;
    } finally {
      if (this.reconciling === run) this.reconciling = undefined;
    }
  }

  private async reconcileBatch(deviceId?: string): Promise<void> {
    const rows = await this.infrastructure.database.deviceOperation.findMany({
      where: {
        state: "queued",
        expiresAt: { not: null },
        ...(deviceId ? { deviceId } : {}),
      },
      include: { device: { select: { genieAcsId: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    for (const row of rows) {
      const verification = row.verification;
      if (!isVerification(verification)) continue; // Legacy tasks have no proof contract.
      try {
        const taskId = row.verificationTaskId ?? row.genieAcsTaskId;
        if (
          taskId &&
          (await this.infrastructure.genieAcs.hasTaskFault(
            row.device.genieAcsId,
            taskId,
          ))
        ) {
          await this.infrastructure.genieAcs.deleteTask(taskId);
          await this.finish(row.id, "failed", "GENIEACS_TASK_FAULT");
          continue;
        }
        if (row.expiresAt && row.expiresAt.valueOf() <= Date.now()) {
          if (taskId) await this.infrastructure.genieAcs.deleteTask(taskId);
          await this.finish(
            row.id,
            "timed_out",
            row.genieAcsTaskId ? "OPERATION_UNCONFIRMED" : "DISPATCH_UNCERTAIN",
          );
          continue;
        }
        if (!row.genieAcsTaskId || row.errorCode === "READBACK_SUBMITTING")
          continue;
        if (await this.infrastructure.genieAcs.getTask(taskId!)) continue;

        if (verification.kind === "ssid" && !row.verificationTaskId) {
          const startedAt = new Date();
          // Persist intent before readback too. A crash cannot create duplicate reads.
          const claimed =
            await this.infrastructure.database.deviceOperation.updateMany({
              where: {
                id: row.id,
                state: "queued",
                verificationRequestedAt: null,
              },
              data: {
                verificationRequestedAt: startedAt,
                errorCode: "READBACK_SUBMITTING",
              },
            });
          if (claimed.count === 0) continue;
          const readback = await this.infrastructure.genieAcs.refreshParameters(
            row.device.genieAcsId,
            verification.paths!,
            { expiresAt: row.expiresAt! },
          );
          await this.infrastructure.database.deviceOperation.update({
            where: { id: row.id },
            data: {
              verificationTaskId: readback.taskId ?? null,
              errorCode: readback.taskId
                ? "AWAITING_READBACK"
                : "READBACK_SUBMITTING",
            },
          });
          continue;
        }

        const projection = [
          "_id",
          "_deviceId",
          "_lastBoot",
          ...adapterRegistry.parameterPaths,
        ];
        const upstream = await this.infrastructure.genieAcs.getDevice(
          row.device.genieAcsId,
          [...projection, ...(verification.paths ?? [])],
        );
        if (!upstream) continue;
        let confirmed = false;
        if (verification.kind === "reboot") {
          const boot = upstream.raw._lastBoot;
          confirmed =
            typeof boot === "string" &&
            boot !== verification.baselineBoot &&
            Date.parse(boot) > row.createdAt.valueOf();
        } else if (
          verification.kind === "refresh" ||
          (verification.kind === "ssid" && row.verificationTaskId)
        ) {
          const since = row.verificationRequestedAt ?? row.createdAt;
          confirmed = verification.paths!.every(
            (path) =>
              (observation(upstream.raw, path)?.timestamp ?? NaN) >
              since.valueOf(),
          );
          if (confirmed && verification.kind === "ssid") {
            confirmed =
              this.fingerprint(
                verification.paths!.map(
                  (path) => observation(upstream.raw, path)?.value,
                ),
              ) === verification.expectedHash;
          }
        }
        if (confirmed) await this.finish(row.id, "executed", null);
      } catch {
        // Keep durable state and retry checks only; never resubmit the original write.
      }
    }
  }

  private async finish(
    id: string,
    state: "queued" | "executed" | "failed" | "timed_out",
    errorCode: string | null,
    taskId?: string,
  ) {
    return this.infrastructure.database.$transaction(async (database) => {
      const row = await database.deviceOperation.update({
        where: { id },
        data: {
          state,
          errorCode,
          ...(taskId ? { genieAcsTaskId: taskId } : {}),
          ...(state === "queued" ? {} : { completedAt: new Date() }),
        },
      });
      await database.auditLog.create({
        data: {
          actorId: row.actorId,
          deviceId: row.deviceId,
          operationId: row.id,
          action: "operation.status.update",
          correlationId: row.correlationId,
          result: state,
          ...(row.genieAcsTaskId ? { genieAcsTaskId: row.genieAcsTaskId } : {}),
          afterSummary: { state, ...(errorCode ? { errorCode } : {}) },
        },
      });
      return row;
    });
  }
}

function accepted(row: {
  id: string;
  state: OperationAcceptedResponse["state"];
  correlationId: string;
  genieAcsTaskId: string | null;
}): OperationAcceptedResponse {
  return {
    operationId: row.id,
    state: row.state,
    correlationId: row.correlationId,
    ...(row.genieAcsTaskId ? { genieAcsTaskId: row.genieAcsTaskId } : {}),
  };
}

function validateKey(value: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw badRequest(
      "INVALID_OPERATION_KEY",
      "Envie uma chave válida para a solicitação.",
    );
}

function operationLifetimeMs(): number {
  const seconds = Number(process.env.OPERATION_TTL_SECONDS ?? 86400);
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 604800)
    throw new Error("OPERATION_TTL_SECONDS must be between 60 and 604800");
  return seconds * 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVerification(value: unknown): value is Verification {
  return (
    isRecord(value) &&
    ["ssid", "refresh", "reboot", "unverifiable"].includes(
      String(value.kind),
    ) &&
    ((value.kind !== "ssid" && value.kind !== "refresh") ||
      (Array.isArray(value.paths) &&
        value.paths.length > 0 &&
        value.paths.every((p) => typeof p === "string")))
  );
}

// NBI metadata only: paths originate in the verified adapter, never guessed here.
function observation(
  raw: Readonly<Record<string, unknown>>,
  path: string,
): { value: unknown; timestamp: number } | undefined {
  let leaf: unknown = raw[path];
  if (leaf === undefined) {
    leaf = raw;
    for (const segment of path.split(".")) {
      if (!isRecord(leaf)) return undefined;
      leaf = leaf[segment];
    }
  }
  if (!isRecord(leaf)) return undefined;
  const timestamp =
    typeof leaf._timestamp === "string" ? Date.parse(leaf._timestamp) : NaN;
  return { value: leaf._value, timestamp };
}
