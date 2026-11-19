import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthController } from "./auth.controller.js";
import type { AuthService } from "./auth.service.js";

afterEach(() => vi.unstubAllEnvs());

describe("session cookie transport security", () => {
  const user = { id: "synthetic-user" };
  const auth = {
    login: vi.fn(async () => ({ token: "synthetic-signed-token", user })),
  } as unknown as AuthService;

  it("requires HTTPS cookies in production for login and logout", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = { setHeader: vi.fn() };
    const controller = new AuthController(auth);
    await controller.login({}, response, { ip: "127.0.0.1" });
    const cookie = response.setHeader.mock.calls[0]?.[1];
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    controller.logout(response);
    expect(response.setHeader.mock.calls[1]?.[1]).toContain(
      "Max-Age=0; Secure",
    );
  });

  it("keeps local development HTTP usable without weakening production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = { setHeader: vi.fn() };
    await new AuthController(auth).login({}, response, { ip: "127.0.0.1" });
    expect(response.setHeader.mock.calls[0]?.[1]).not.toContain("Secure");
    expect(response.setHeader.mock.calls[0]?.[1]).toContain("HttpOnly");
  });
});
