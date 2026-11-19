import assert from "node:assert/strict";
import test from "node:test";

import {
  AuthorizationError,
  createSessionToken,
  hashPassword,
  hasPermission,
  PERMISSIONS,
  requirePermission,
  ROLE_PERMISSIONS,
  verifyPassword,
  verifySessionToken,
} from "../dist/index.js";

test("grants every permission only to an active administrator", () => {
  for (const permission of PERMISSIONS) {
    assert.equal(
      hasPermission({ role: "ADMIN", isActive: true }, permission),
      true,
    );
  }
  assert.equal(ROLE_PERMISSIONS.ADMIN.length, PERMISSIONS.length);
});

test("keeps Support L1 away from dangerous operations", () => {
  const support = { role: "SUPPORT_L1", isActive: true };

  assert.equal(hasPermission(support, "wifi.write"), true);
  assert.equal(hasPermission(support, "device.reboot"), true);
  for (const permission of [
    "device.factory_reset",
    "wan.read",
    "wan.write",
    "firmware.read",
    "firmware.deploy",
    "batch.execute",
  ]) {
    assert.equal(hasPermission(support, permission), false);
  }
});

test("denies inactive and unknown roles by default", () => {
  assert.equal(
    hasPermission({ role: "ADMIN", isActive: false }, "device.read"),
    false,
  );
  assert.equal(
    hasPermission({ role: "UNRECOGNIZED", isActive: true }, "device.read"),
    false,
  );
});

test("raises a stable domain error when permission is missing", () => {
  assert.throws(
    () =>
      requirePermission({ role: "READ_ONLY", isActive: true }, "wifi.write"),
    (error) =>
      error instanceof AuthorizationError &&
      error.code === "FORBIDDEN_OPERATION",
  );
});

test("hashes passwords with a random salt and verifies them", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");

  assert.notEqual(first, second);
  assert.equal(
    await verifyPassword("correct horse battery staple", first),
    true,
  );
  assert.equal(await verifyPassword("incorrect password", first), false);
});

test("signs expiring session tokens and rejects tampering", () => {
  const secret = "test-session-secret-with-at-least-32-bytes";
  const expiresAt = new Date("2026-08-12T13:00:00.000Z");
  const token = createSessionToken("user-1", secret, expiresAt);

  assert.deepEqual(
    verifySessionToken(token, secret, new Date("2026-08-12T12:00:00.000Z")),
    { sub: "user-1", exp: expiresAt.valueOf() / 1000 },
  );
  assert.equal(
    verifySessionToken(
      `${token.slice(0, -1)}x`,
      secret,
      new Date("2026-08-12T12:00:00.000Z"),
    ),
    null,
  );
  assert.equal(verifySessionToken(token, secret, expiresAt), null);
});
