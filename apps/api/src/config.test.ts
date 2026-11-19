import { describe, expect, it } from "vitest";

import { readPort } from "./config.js";

describe("readPort", () => {
  it("accepts a valid port", () => {
    expect(readPort("3100")).toBe(3100);
  });

  it("rejects an invalid port", () => {
    expect(() => readPort("70000")).toThrow(/API_PORT/);
  });
});
