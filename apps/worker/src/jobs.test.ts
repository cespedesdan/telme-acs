import { describe, expect, it } from "vitest";

import { processSystemJob } from "./jobs.js";

describe("processSystemJob", () => {
  it("handles the health job", () => {
    expect(processSystemJob("health")).toEqual({ status: "ok" });
  });

  it("rejects unknown jobs", () => {
    expect(() => processSystemJob("device.reboot")).toThrow(/Unsupported/);
  });
});
