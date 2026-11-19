import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@telme/contracts";
import type { InfrastructureService } from "../infrastructure.service.js";
import { OperationsService } from "./operations.service.js";

describe("durable device operations", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "synthetic-test-only-session-secret";
  });

  function harness() {
    const events: string[] = [];
    let row: Record<string, unknown> | undefined;
    const database = {
      deviceOperation: {
        findUnique: vi.fn(async () => row ?? null),
        findMany: vi.fn(async () =>
          row ? [{ ...row, device: { genieAcsId: "synthetic-cpe" } }] : [],
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          events.push("intent");
          row = {
            id: randomUUID(),
            genieAcsTaskId: null,
            verificationTaskId: null,
            verificationRequestedAt: null,
            createdAt: new Date(),
            ...data,
          };
          return row;
        }),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(row!, data);
          return row;
        }),
        updateMany: vi.fn(
          async ({ data }: { data: Record<string, unknown> }) => {
            Object.assign(row!, data);
            return { count: 1 };
          },
        ),
      },
      auditLog: {
        create: vi.fn(async () => {
          events.push("audit");
          return {};
        }),
      },
      $transaction: vi.fn(
        async (run: (transaction: unknown) => Promise<unknown>) =>
          run(database),
      ),
    };
    const genieAcs = {
      hasTaskFault: vi.fn(async () => false),
      getTask: vi.fn(async () => undefined),
      getDevice: vi.fn(async () => undefined as unknown),
      refreshParameters: vi.fn(async () => ({
        state: "queued",
        taskId: "readback-task",
      })),
      deleteTask: vi.fn(async () => undefined),
    };
    const service = new OperationsService({
      database,
      genieAcs,
    } as unknown as InfrastructureService);
    const input = {
      key: randomUUID(),
      deviceId: randomUUID(),
      actor: { id: randomUUID() } as SessionUser,
      type: "wifi.ssid.update.2.4ghz",
      action: "wifi.ssid.update",
      payload: { ssid: "TEST" },
      safeSummary: { ssid: "TEST" },
      verification: {
        kind: "ssid" as const,
        paths: ["Verified.Ssid"],
        expectedHash: service.fingerprint(["TEST"]),
      },
      run: vi.fn(async () => {
        events.push("dispatch");
        return {
          state: "queued" as const,
          taskId: "write-task",
          deviceId: "synthetic-cpe",
          taskName: "setParameterValues" as const,
        };
      }),
    };
    return { service, database, genieAcs, input, events, row: () => row! };
  }

  it("records intent and audit before dispatch and replays without a second task", async () => {
    const h = harness();
    const first = await h.service.submit(h.input);
    expect(h.events.slice(0, 3)).toEqual(["intent", "audit", "dispatch"]);
    expect(await h.service.submit(h.input)).toEqual(first);
    expect(h.input.run).toHaveBeenCalledTimes(1);
    await expect(
      h.service.submit({ ...h.input, payload: { ssid: "DIFFERENT" } }),
    ).rejects.toThrow();
  });

  it("does not dispatch when audit persistence fails", async () => {
    const h = harness();
    h.database.auditLog.create.mockRejectedValueOnce(
      new Error("DB unavailable"),
    );
    await expect(h.service.submit(h.input)).rejects.toThrow("DB unavailable");
    expect(h.input.run).not.toHaveBeenCalled();
  });

  it("never automatically resends a request with an uncertain response", async () => {
    const h = harness();
    h.input.run.mockRejectedValueOnce(new Error("connection lost"));
    expect((await h.service.submit(h.input)).state).toBe("queued");
    expect(h.row().errorCode).toBe("DISPATCH_UNCERTAIN");
    await h.service.submit(h.input);
    await h.service.reconcile();
    expect(h.input.run).toHaveBeenCalledTimes(1);
  });

  it("requires a separate readback, then fresh matching evidence to confirm SSID", async () => {
    const h = harness();
    await h.service.submit(h.input);
    await h.service.reconcile();
    expect(h.row().state).toBe("queued");
    expect(h.genieAcs.refreshParameters).toHaveBeenCalledTimes(1);
    const since = (h.row().verificationRequestedAt as Date).valueOf();
    h.genieAcs.getDevice.mockResolvedValue({
      raw: {
        "Verified.Ssid": {
          _value: "TEST",
          _timestamp: new Date(since - 1).toISOString(),
        },
      },
    });
    await h.service.reconcile();
    expect(h.row().state).toBe("queued");
    h.genieAcs.getDevice.mockResolvedValue({
      raw: {
        "Verified.Ssid": {
          _value: "TEST",
          _timestamp: new Date(since + 1).toISOString(),
        },
      },
    });
    await h.service.reconcile();
    expect(h.row().state).toBe("executed");
    expect(h.genieAcs.refreshParameters).toHaveBeenCalledTimes(1);
  });

  it("a disappeared reboot task without a new BOOT remains queued", async () => {
    const h = harness();
    await h.service.submit({ ...h.input, verification: { kind: "reboot" } });
    h.genieAcs.getDevice.mockResolvedValue({ raw: {} });
    await h.service.reconcile();
    expect(h.row().state).toBe("queued");
    h.genieAcs.getDevice.mockResolvedValue({
      raw: {
        _lastBoot: new Date(
          (h.row().createdAt as Date).valueOf() + 1000,
        ).toISOString(),
      },
    });
    await h.service.reconcile();
    expect(h.row().state).toBe("executed");
  });

  it("cancels faulted tasks before recording failure", async () => {
    const h = harness();
    await h.service.submit(h.input);
    h.genieAcs.hasTaskFault.mockResolvedValue(true);
    await h.service.reconcile();
    expect(h.genieAcs.deleteTask).toHaveBeenCalledWith("write-task");
    expect(h.row().state).toBe("failed");
  });

  it("expires unconfirmed tasks only after cancelling the upstream task", async () => {
    const h = harness();
    await h.service.submit(h.input);
    h.row().expiresAt = new Date(0);
    h.genieAcs.deleteTask.mockRejectedValueOnce(new Error("NBI unavailable"));
    await h.service.reconcile();
    expect(h.row().state).toBe("queued");
    await h.service.reconcile();
    expect(h.row().state).toBe("timed_out");
  });
});
