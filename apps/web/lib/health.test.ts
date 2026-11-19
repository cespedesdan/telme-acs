import { describe, expect, it } from "vitest";

import { webHealth } from "./health";

describe("webHealth", () => {
  it("reports the web app as healthy", () => {
    expect(webHealth.status).toBe("ok");
  });
});
