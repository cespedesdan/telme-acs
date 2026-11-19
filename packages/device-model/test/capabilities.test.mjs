import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeviceCapabilities,
  DEVICE_CAPABILITIES,
  classifyDeviceContact,
} from "../dist/index.js";

test("classifies contact freshness using explicit windows", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  assert.equal(classifyDeviceContact(undefined, now), "unknown");
  assert.equal(classifyDeviceContact(new Date(NaN), now), "unknown");
  assert.equal(
    classifyDeviceContact(new Date(now.valueOf() - 60000), now),
    "online",
  );
  assert.equal(
    classifyDeviceContact(new Date(now.valueOf() - 3600000), now),
    "stale",
  );
  assert.equal(
    classifyDeviceContact(new Date(now.valueOf() - 90000000), now),
    "offline",
  );
});

test("keeps every unspecified capability explicitly unknown", () => {
  const capabilities = createDeviceCapabilities({ identity: "supported" });

  assert.deepEqual(Object.keys(capabilities), [...DEVICE_CAPABILITIES]);
  assert.equal(capabilities.identity, "supported");
  assert.equal(capabilities.wifi24, "unknown");
  assert.equal(capabilities.factoryReset, "unknown");
  assert.equal(Object.isFrozen(capabilities), true);
});

test("does not confuse unsupported with unknown", () => {
  const capabilities = createDeviceCapabilities({ opticalRx: "unsupported" });

  assert.equal(capabilities.opticalRx, "unsupported");
  assert.equal(capabilities.opticalTx, "unknown");
});
