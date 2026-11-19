import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken } from "@telme/auth";
import { AuthService } from "./auth.service.js";
import type { InfrastructureService } from "../infrastructure.service.js";

describe("login protection and availability", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET =
      "synthetic-auth-test-only-secret-at-least-32-bytes";
  });
  it("limits repeated login attempts before further database queries", async () => {
    const findUnique = vi.fn(async () => null);
    const service = new AuthService({
      database: { user: { findUnique } },
    } as unknown as InfrastructureService);
    for (let i = 0; i < 30; i++)
      await expect(
        service.login("test@example.invalid", "invalid", "test-source"),
      ).rejects.toMatchObject({ status: 401 });
    await expect(
      service.login("test@example.invalid", "invalid", "test-source"),
    ).rejects.toMatchObject({ status: 429 });
    expect(findUnique).toHaveBeenCalledTimes(30);
  });
  it("does not describe database outage as invalid login or session", async () => {
    const service = new AuthService({
      database: {
        user: {
          findUnique: vi.fn(async () => {
            throw new Error("database down");
          }),
        },
      },
    } as unknown as InfrastructureService);
    await expect(
      service.login("test@example.invalid", "invalid"),
    ).rejects.toMatchObject({ status: 503 });
    const token = createSessionToken(
      "synthetic-user",
      process.env.SESSION_SECRET!,
      new Date(Date.now() + 60000),
    );
    await expect(service.authenticate(token)).rejects.toMatchObject({
      status: 503,
    });
  });
});
