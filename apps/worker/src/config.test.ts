import { describe, expect, it } from "vitest";
import { readRedisUrl } from "./config.js";

describe("worker configuration", () => {
  it("honors a custom Redis endpoint", () => {
    expect(readRedisUrl("redis://127.0.0.1:6380/1")).toBe(
      "redis://127.0.0.1:6380/1",
    );
    expect(readRedisUrl("rediss://redis.example.invalid:6379")).toContain(
      "rediss:",
    );
  });
  it("rejects an invalid endpoint without echoing credentials", () => {
    expect(() => readRedisUrl("https://invalid.example.invalid")).toThrow(
      "REDIS_URL must be a valid Redis URL",
    );
    expect(() => readRedisUrl("")).toThrow(/REDIS_URL/);
  });
});
