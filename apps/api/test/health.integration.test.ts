import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, it } from "vitest";

import { createApp } from "../src/bootstrap.js";
import { apiHealth } from "../src/health/health.controller.js";

describe("GET /api/v1/health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the liveness state", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200, apiHealth);
  });
});
