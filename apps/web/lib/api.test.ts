import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

afterEach(() => vi.unstubAllGlobals());
describe("API availability and session errors", () => {
  it("handles proxy HTML with a readable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>offline</html>", { status: 502 })),
    );
    await expect(api("/devices")).rejects.toMatchObject({
      status: 502,
      message: "Serviço temporariamente indisponível.",
    });
  });
  it("preserves readiness results on HTTP 503", async () => {
    const body = {
      status: "degraded",
      checks: { database: "ok", genieAcs: "unavailable" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(body, { status: 503 })),
    );
    await expect(api("/health/ready")).rejects.toMatchObject({
      responseBody: body,
    });
  });
  it("distinguishes an uncertain mutation response from a login rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network offline");
      }),
    );
    try {
      await api("/devices/id/reboot", { method: "POST" });
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(0);
      expect((error as ApiError).message).toContain("pode estar em andamento");
    }
  });
});
